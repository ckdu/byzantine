require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const path = require('path'); // Needed for filename extraction and extension check

const app = express();
const port = process.env.PORT || 3000;

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

// --- Middleware ---
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    // console.log('User is authenticated:', req.session.user.email); // Less verbose
    return next();
  }
  console.log('User not authenticated, redirecting to login.');
  res.redirect('/auth/google');
}


// --- Helper Functions ---
/**
 * Checks if a user email is approved in the Google Sheet.
 * @param {string} email The user's email address.
 * @returns {Promise<string|null>} The Full Name from the sheet if approved, otherwise null.
 */
async function getApprovedUserName(email) {
    if (!email) return null;
    console.log(`Checking approval for: ${email}`);
    try {
        // Determine the start and end columns needed to include Email, Full Name, and Approved status
        const columns = [
            process.env.EMAIL_COLUMN_LETTER,
            process.env.FULL_NAME_COLUMN_LETTER,
            process.env.APPROVED_COLUMN_LETTER
        ];
        // Sort column letters alphabetically to determine range start/end
        columns.sort();
        const startCol = columns[0];
        const endCol = columns[columns.length - 1];
        const range = `${process.env.APPROVED_SHEET_NAME}!${startCol}:${endCol}`;
        console.log(`Fetching range: ${range}`);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: range,
        });

        const rows = response.data.values;
        if (rows && rows.length) {
            // Calculate the relative indices based on the fetched range's start column
            const startCharCode = startCol.charCodeAt(0);
            const emailColIndex = process.env.EMAIL_COLUMN_LETTER.charCodeAt(0) - startCharCode;
            const nameColIndex = process.env.FULL_NAME_COLUMN_LETTER.charCodeAt(0) - startCharCode;
            const approvedColIndex = process.env.APPROVED_COLUMN_LETTER.charCodeAt(0) - startCharCode;

            for (const row of rows) {
                const rowEmail = row[emailColIndex];
                const rowApprovedStatus = row[approvedColIndex];
                const rowFullName = row[nameColIndex];

                if (rowEmail && rowEmail.toLowerCase() === email.toLowerCase()) {
                    console.log(`Found email match for ${email}. Approved status: ${rowApprovedStatus}, Name: ${rowFullName}`);
                    // Check if approved status is exactly 'TRUE' (case-insensitive)
                    if (rowApprovedStatus && rowApprovedStatus.toUpperCase() === 'TRUE') {
                        // Return the Full Name found in the sheet, default to empty string if missing
                        return rowFullName || '';
                    } else {
                        // Found the email, but not approved
                        console.log(`Email ${email} found but not approved.`);
                        return null; // Explicitly return null for "found but not approved"
                    }
                }
            }
        }
        // Email was not found in the sheet at all
        console.log(`Email ${email} not found in the sheet.`);
        return null; // Return null if email is not found
    } catch (err) {
        console.error('Error checking Google Sheet:', err.message);
        return null; // Return null on error
    }
}


// --- Routes ---

// Landing Page
app.get('/', (req, res) => {
    res.send('Byzantine Backend. <a href="/auth/google">Login with Google</a>');
});

// Google OAuth Flow Start
app.get('/auth/google', (req, res) => {
    const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'online',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'openid'
        ],
        // prompt: 'consent' // Optional for testing
    });
    res.redirect(authorizeUrl);
});

// Google OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Missing authorization code.');
    }
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const userInfo = await oauth2Client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
        // Store only essential info needed later (email for approval check, maybe google name as fallback)
        const user = {
            email: userInfo.data.email,
            googleName: userInfo.data.name, // Store Google name as a fallback if needed
        };
        console.log('User authenticated:', user.email);

        req.session.user = user; // Store minimal user object in session

        req.session.save(err => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(500).send('Authentication failed during session save.');
            }
            // !!! IMPORTANT: Replace this URL with your actual Google Site page !!!
            res.redirect('https://sites.google.com/view/byzant');
        });

    } catch (error) {
        console.error('Error during Google OAuth callback:', error.response ? error.response.data : error.message);
        res.status(500).send('Authentication failed');
    }
});

// Logout
app.get('/logout', (req, res) => {
    const userEmail = req.session.user ? req.session.user.email : 'User';
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).send('Could not log out.');
        }
        res.clearCookie('connect.sid');
        console.log(`${userEmail} logged out.`);
         // !!! IMPORTANT: Replace this URL with your actual Google Site page !!!
        res.redirect('https://sites.google.com/view/byzant');
    });
});


// DYNAMIC PDF View Endpoint (Using Full Name from Sheet)
app.get('/view/:filename', isAuthenticated, async (req, res) => {
  const requestedFilename = req.params.filename;

  // Validation: Check if filename ends with .pdf
  if (!requestedFilename || !requestedFilename.toLowerCase().endsWith('.pdf')) {
      console.log(`Invalid request: Filename does not end with .pdf (${requestedFilename})`);
      return res.status(400).send('Invalid request: Filename must end with .pdf');
  }
  // Basic sanitization
  if (requestedFilename.includes('/') || requestedFilename.includes('..')) {
      return res.status(400).send('Invalid filename.');
  }

  if (!req.session || !req.session.user) {
    console.error("User session missing in view route after isAuthenticated passed!");
    return res.status(500).send("Internal Server Error: Session lost.");
  }
  const userEmail = req.session.user.email;
  // We will get the name to use from the approval check function
  const parentFolderId = process.env.DRIVE_PDF_FOLDER_ID;
  const googleFormsLink = process.env.GOOGLE_FORMS_LINK || '#'; // Fallback link

  console.log(`View request for: ${requestedFilename} by ${userEmail}`);

  let fileId = null;

  try {
    // 1. Check Approval AND get Full Name from Sheet
    const sheetFullName = await getApprovedUserName(userEmail);

    // Check if sheetFullName is null (meaning not found or not approved)
    if (sheetFullName === null) {
      console.log(`Access denied for ${userEmail} (Not Approved or Not Found in Sheet)`);
      // Send back HTML with a helpful message and the link
      res.status(403).send(`
        <html>
          <head><title>Access Denied</title></head>
          <body style="font-family: sans-serif; padding: 20px;">
            <h1>Access Denied</h1>
            <p>Your email (${userEmail}) is logged in, but has not yet been approved.</p>
            <p>If you haven't registered yet, please fill out the access request form:</p>
            <p><a href="${googleFormsLink}" target="_blank">Request Access Form</a></p>
            <p>If you have already registered, please wait for your request to be approved. Thank you for your patience.</p>
          </body>
        </html>
      `);
      return; // Stop execution
    }

    // If we reach here, user is approved, and sheetFullName contains the name from the sheet
    // Use sheetFullName, but fallback to an empty string if it was somehow empty in the sheet
    const nameForWatermark = sheetFullName || 'Approved User'; // Use the name from the sheet
    console.log(`Access granted for ${userEmail}. Using name: "${nameForWatermark}"`);


    // 2. Find File ID in Google Drive by Name
    console.log(`Searching for filename "${requestedFilename}" in folder ID "${parentFolderId}"`);
    const searchResponse = await drive.files.list({
        q: `name='${requestedFilename}' and '${parentFolderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });

    if (!searchResponse.data.files || searchResponse.data.files.length === 0) {
        console.log(`File not found in Drive: ${requestedFilename}`);
        return res.status(404).send('File not found.');
    }
    if (searchResponse.data.files.length > 1) {
        console.warn(`Multiple files found with name: ${requestedFilename}. Using the first one found (ID: ${searchResponse.data.files[0].id}).`);
    }

    fileId = searchResponse.data.files[0].id;
    const actualFilename = searchResponse.data.files[0].name;
    console.log(`Found file ID: ${fileId} for filename: ${actualFilename}`);

    // 3. Fetch from Google Drive using File ID
    const fileResponse = await drive.files.get(
        { fileId: fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
    );
    const pdfBytes = Buffer.from(fileResponse.data);
    console.log(`Fetched ${pdfBytes.length} bytes from Drive.`);

    // 4. Watermark with pdf-lib (using name from sheet)
    console.log(`Watermarking PDF for ${nameForWatermark} (${userEmail})`);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const obliqueFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    // Use the name fetched from the Google Sheet for the watermark
    const watermarkText = `Authorized liturgical use for ${nameForWatermark}. Generated: ${timestamp}`;
    const pages = pdfDoc.getPages();
    const fontSize = 8; const textGray = rgb(0.5, 0.5, 0.5);
    pages.forEach(page => { page.drawText(watermarkText, { x: 30, y: 20, size: fontSize, font: obliqueFont, color: textGray }); });
    const watermarkedPdfBytes = await pdfDoc.save();
    console.log(`Watermarked PDF size: ${watermarkedPdfBytes.length} bytes.`);

    // 5. Send the watermarked PDF
    const safeUserName = nameForWatermark.replace(/[^a-z0-9]/gi, '_').toLowerCase(); // Use sheet name for output file too
    const outputFilename = `${path.parse(actualFilename).name}_${safeUserName}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${outputFilename}"`); // Display inline
    res.send(Buffer.from(watermarkedPdfBytes));

  } catch (error) {
    // Error Handling (same as before)
    let fileIdForError = 'N/A';
     if (typeof fileId !== 'undefined') { fileIdForError = fileId; }
    if (error.response && error.response.status) {
         console.error(`Google API Error (Status: ${error.response.status}) during operation for file '${requestedFilename}' (Drive ID: ${fileIdForError}):`, error.response.data || error.message);
         if (error.response.status === 404) { res.status(404).send('File not found in Drive or backend lacks permission.'); }
         else if (error.response.status === 403) { res.status(403).send('Permission denied accessing Google Drive/Sheets. Check API Key restrictions or Service Account permissions.'); }
         else { res.status(500).send('Error communicating with Google services.'); }
    } else if (error.message.includes('Sheet')) {
         console.error('Error accessing Google Sheet:', error);
         res.status(500).send('Error checking user approval.');
    } else {
        console.error(`Generic error during file viewing/watermarking for ${requestedFilename}:`, error);
        res.status(500).send('Error processing your request.');
    }
  }
});


// --- Start Server ---
app.listen(port, () => {
    console.log(`Byzantine backend listening at http://localhost:${port}`);
});