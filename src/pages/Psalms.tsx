import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'; // Import pdf-lib directly

const Psalms: React.FC = () => {
  const { user } = useAuth();
  // isLoading now just provides brief feedback on the link
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({}); // Use object for multiple links later
  const [error, setError] = useState<string | null>(null);

  // --- Data specific to this Psalm Link ---
  const psalmKey = 'psalm134'; // Unique key for loading state
  const psalmTitle = "Psalm 134 - Polyeleos an adaptation based on the composition of Mitri El-Murr";
  const basePdfPath = '/base_psalm_134.pdf'; // The base PDF for *this* specific link
  // --- End Psalm Specific Data ---

  const handleGenerateAndOpen = async (key: string, basePdfFilePath: string, title: string) => {
    setError(null);
    if (!user) {
      setError("User not logged in.");
      return;
    }

    setIsLoading(prev => ({ ...prev, [key]: true })); // Set loading for this specific link

    let objectUrl: string | null = null; // Keep track of the URL for potential cleanup

    try {
      console.log(`Starting PDF generation for: ${title}`);
      // 1. Fetch the base PDF
      const existingPdfBytes = await fetch(basePdfFilePath).then(res => {
        if (!res.ok) throw new Error(`Failed to fetch base PDF (${res.status} ${res.statusText})`);
        return res.arrayBuffer();
      });

      // 2. Load with pdf-lib & watermark
      console.log("Processing PDF...");
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const obliqueFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const watermarkText = `Authorized liturgical use for ${user?.fullName}. Generated: ${timestamp}`;
      const pages = pdfDoc.getPages();
      const fontSize = 8; const textGray = rgb(0.5, 0.5, 0.5);
      pages.forEach(page => { page.drawText(watermarkText, { x: 30, y: 20, size: fontSize, font: obliqueFont, color: textGray }); });

      // 3. Save modified PDF bytes
      console.log("Finalizing PDF...");
      const pdfBytes = await pdfDoc.save();
      if (!pdfBytes || pdfBytes.length === 0) { throw new Error("pdf-lib generated empty PDF data."); }
      console.log("PDF Bytes generated, size:", pdfBytes.length);

      // 4. Create Blob and Object URL
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      objectUrl = URL.createObjectURL(blob);
      console.log("Created Object URL:", objectUrl);

      // 5. Open in new tab
      window.open(objectUrl, '_blank');
      console.log("Opened PDF in new tab.");

      // 6. Revoke the Object URL after a short delay
      // This allows the new tab time to load the resource before it's released
      // Important for memory management!
      setTimeout(() => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          console.log("Revoked Object URL:", objectUrl);
        }
      }, 10000); // 10 seconds delay (adjust if needed, but usually safe)

    } catch (err) {
      console.error(`Error generating/opening PDF for ${title}:`, err);
      setError(`Failed to prepare PDF: ${err instanceof Error ? err.message : String(err)}`);
      // Clean up URL if created before error
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        console.log("Revoked Object URL due to error:", objectUrl);
      }
    } finally {
      // Reset loading state for this specific link
      setIsLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div>
      <h2>Psalms</h2>
      <p>Available Psalms:</p>
      <div>
        {/* Link for Psalm 134 */}
        <h3 style={{ marginBottom: '1rem' }}>
            <a
              href="#"
              onClick={(e) => {
                  e.preventDefault();
                  // Pass unique key, path, and title
                  handleGenerateAndOpen(psalmKey, basePdfPath, psalmTitle);
              }}
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
              aria-disabled={isLoading[psalmKey]} // Check loading state for this key
            >
                {isLoading[psalmKey] ? 'Generating...' : psalmTitle}
            </a>
        </h3>

        {/* EXAMPLE: Add another psalm link here */}
        {/* <h3 style={{ marginBottom: '1rem' }}>
            <a
              href="#"
              onClick={(e) => {
                  e.preventDefault();
                  handleGenerateAndOpen('psalm_XYZ', '/path/to/other_psalm.pdf', 'Another Psalm Title');
              }}
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
              aria-disabled={isLoading['psalm_XYZ']}
            >
                {isLoading['psalm_XYZ'] ? 'Generating...' : 'Another Psalm Title'}
            </a>
        </h3> */}

        {error && <p className="error-message" style={{ marginTop: '0.5em' }}>{error}</p>}

      </div>
    </div>
  );
};

export default Psalms;