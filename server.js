require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const port = process.env.PORT || 3000;

// --- Caching Setup ---
const driveCache = new NodeCache({ stdTTL: 86400 }); // 1 day for original PDFs
const pdfCache = new NodeCache({ stdTTL: 7200 });   // 2 hours for watermarked PDFs

// --- Google API Clients ---
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);
const sheets = google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY });
const drive = google.drive({ version: 'v3', auth: process.env.GOOGLE_API_KEY });

// --- Session Configuration ---
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  console.log('User not authenticated, redirecting to login.');
  res.redirect('/auth/google');
}

async function getApprovedUserName(email) {
  if (!email) return null;
  try {
    const columns = [
      process.env.EMAIL_COLUMN_LETTER,
      process.env.FULL_NAME_COLUMN_LETTER,
      process.env.APPROVED_COLUMN_LETTER
    ];
    columns.sort();
    const startCol = columns[0];
    const endCol = columns[columns.length - 1];
    const range = `${process.env.APPROVED_SHEET_NAME}!${startCol}:${endCol}`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (rows && rows.length) {
      const startCharCode = startCol.charCodeAt(0);
      const emailColIndex = process.env.EMAIL_COLUMN_LETTER.charCodeAt(0) - startCharCode;
      const nameColIndex = process.env.FULL_NAME_COLUMN_LETTER.charCodeAt(0) - startCharCode;
      const approvedColIndex = process.env.APPROVED_COLUMN_LETTER.charCodeAt(0) - startCharCode;

      for (const row of rows) {
        const rowEmail = row[emailColIndex];
        const rowApprovedStatus = row[approvedColIndex];
        const rowFullName = row[nameColIndex];

        if (rowEmail && rowEmail.toLowerCase() === email.toLowerCase()) {
          if (rowApprovedStatus && rowApprovedStatus.toUpperCase() === 'TRUE') {
            return rowFullName || '';
          } else {
            console.log(`Email ${email} found but not approved.`);
            return null;
          }
        }
      }
    }
    console.log(`Email ${email} not found in the sheet.`);
    return null;
  } catch (err) {
    console.error(`Error checking Google Sheet: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
}

// --- Routes ---

app.get('/', (req, res) => {
  res.send('Byzantine Backend. <a href="/auth/google">Login with Google</a>');
});

app.get('/auth/google', (req, res) => {
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'online',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid'
    ]
  });
  res.redirect(authorizeUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing authorization code.');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const userInfo = await oauth2Client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
    const user = {
      email: userInfo.data.email,
      googleName: userInfo.data.name,
    };

    req.session.user = user;
    req.session.save(err => {
      if (err) return res.status(500).send('Authentication failed during session save.');
      res.redirect('https://sites.google.com/view/byzant');
    });
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

app.get('/logout', (req, res) => {
  const userEmail = req.session.user ? req.session.user.email : 'User';
  req.session.destroy(err => {
    if (err) return res.status(500).send('Could not log out.');
    res.clearCookie('connect.sid');
    res.redirect('https://sites.google.com/view/byzant');
  });
});

app.get('/view/:filename', isAuthenticated, async (req, res) => {
  const requestedFilename = req.params.filename;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Cookie');

  if (!requestedFilename || !requestedFilename.toLowerCase().endsWith('.pdf')) {
    return res.status(400).send('Invalid request: Filename must end with .pdf');
  }
  if (requestedFilename.includes('/') || requestedFilename.includes('..')) {
    return res.status(400).send('Invalid filename.');
  }

  const userEmail = req.session.user.email;
  const parentFolderId = process.env.DRIVE_PDF_FOLDER_ID;
  const googleFormsLink = process.env.GOOGLE_FORMS_LINK || '#';

  try {
    const sheetFullName = await getApprovedUserName(userEmail);
    if (sheetFullName === null) {
      return res.status(403).send(`
        <html>
          <head><title>Access Denied</title></head>
          <body style="font-family: sans-serif; padding: 20px;">
            <h1>Access Denied</h1>
            <p>Your email (${userEmail}) is logged in, but has not yet been approved.</p>
            <p><a href="${googleFormsLink}" target="_blank">Request Access Form</a></p>
            <p>Please wait for approval.</p>
          </body>
        </html>
      `);
    }

    const nameForWatermark = sheetFullName || 'Approved User';
    const safeUserName = nameForWatermark.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const cacheKey = `${requestedFilename}_${safeUserName}`;
    const cachedPDF = pdfCache.get(cacheKey);
    if (cachedPDF) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${requestedFilename}"`);
      return res.send(cachedPDF);
    }

    const driveCacheKey = `original_${requestedFilename}`;
    let pdfBytes = driveCache.get(driveCacheKey);

    if (!pdfBytes) {
      const searchResponse = await drive.files.list({
        q: `name='${requestedFilename}' and '${parentFolderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (!searchResponse.data.files?.length) {
        return res.status(404).send('File not found.');
      }

      const fileId = searchResponse.data.files[0].id;
      const fileResponse = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      pdfBytes = Buffer.from(fileResponse.data);
      driveCache.set(driveCacheKey, pdfBytes);
    }

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const obliqueFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const watermarkText = `Authorized liturgical use for ${nameForWatermark}. Generated: ${timestamp}`;
    const pages = pdfDoc.getPages();
    pages.forEach(page => {
      page.drawText(watermarkText, {
        x: 30, y: 20, size: 8, font: obliqueFont, color: rgb(0.5, 0.5, 0.5)
      });
    });
    const watermarkedPdfBytes = Buffer.from(await pdfDoc.save());
    pdfCache.set(cacheKey, watermarkedPdfBytes);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${requestedFilename}"`);
    res.send(watermarkedPdfBytes);    
  } catch (error) {
    console.error('View route error:', error);
    res.status(500).send('Error processing your request.');
  }
});

app.listen(port, () => {
  console.log(`Byzantine backend listening at http://localhost:${port}`);
});