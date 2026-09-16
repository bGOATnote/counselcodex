# Google Slides import

Use [counsel-disposition-google-slides.pptx](../output/submission-2026-09-15/counsel-disposition-google-slides.pptx).
It contains the same slides as the standard PowerPoint, with an explicit name
for the import workflow. The [PDF](../output/submission-2026-09-15/counsel-disposition-take-home.pdf)
is the visual reference.

## Open in Google Slides

1. Download the `.pptx` file from the link above.
2. In Google Drive, choose **New → File upload** and select it.
3. Open the uploaded file with **Google Slides**. Convert it to Google Slides
   format if a native Google copy is needed; editing an Office file directly
   can otherwise retain the original `.pptx` format.

Google documents the [upload and import workflow](https://support.google.com/a/users/answer/10665800?hl=en)
and the distinction between [Office editing and conversion](https://support.google.com/docs/answer/9406611?hl=en).
Conversion creates a separate copy, so retain the source export and PDF.

## Compatibility choices

- Widescreen 16:9 layout and Arial text, including inherited theme defaults.
- Editable native text, shapes and tables; slides are not flattened screenshots.
- Embedded PNG/JPEG images, with no external image dependencies.
- Speaker notes and clickable cover links retained in the PowerPoint.
- No macros, embedded applications, animations, SmartArt or linked spreadsheets.

The exported package and rendered PDF were inspected locally. **The file has
not been imported or inspected inside Google Slides.** Conversion can change
wrapping, table height, notes or hyperlinks. Check all 28 slides against the PDF,
especially the cover, C22/C47 slides and roadmap tables. Confirm that the public
reviewer-guide link works and remember that the local GUI link requires a
running server on the viewing computer.

The exports can be opened without the repository's build tools. Regenerating
the deck from its JSON source uses the bundled `@oai/artifact-tool` environment
described in the builder; it is not part of ordinary `npm ci` or demo setup.
