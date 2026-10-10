# Hindi Translator — Chrome Extension

Translate English webpages into Hindi using a browser extension.

## Features

- Translate English webpage text into Hindi
- Translate selected text
- Translation style options: Natural, Simple, Technical, Literal
- Configurable translation provider
- Restore original webpage text

**Note:** Translation quality and availability depend on the selected provider.

## Installation

1. Download the latest ZIP file from the [Releases](../../releases) page.
2. Extract the ZIP file.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted folder containing `manifest.json`.
7. Pin the extension to the Chrome toolbar.

## Usage

1. Open an English webpage.
2. Click the Hindi Translator extension icon.
3. Configure your translation provider in Options.
4. Click **Translate Page**.
5. Use the restore option to return to the original text.

## Translation Providers

The extension may support MyMemory, LibreTranslate, and OpenAI-compatible APIs, depending on configuration.

Some providers require an API key, server URL, or additional setup. Never share private API keys.

## Development

The repository includes a Node.js backend for optional API-based translation.

To run it locally:

```bash
cd backend
npm install
npm start
```

Create `backend/.env` from `backend/.env.example` and configure your provider before starting.

## Privacy

Translation requests may send selected webpage text to the configured translation service. Avoid translating confidential or sensitive information unless you trust the selected provider.

See the project's privacy policy for additional details.

## License

License information will be added separately. Do not assume permission to redistribute or modify the project beyond applicable law until a license is specified.