# vidilearn

Production-grade global content extraction agent for YouTube and Web. Extract transcripts, clean articles, and metadata with a single command. No API keys required.

## Installation

### From Source (Local Development)
```bash
git clone https://github.com/yourusername/vidilearn
cd vidilearn
npm install
npm link
```

### Global Installation
```bash
npm install -g .
```

### From NPM (Once published)
```bash
npm install -g vidilearn
```

## Usage

### 1. Full Extraction
Metadata + Content/Transcript saved to JSON (default).
```bash
vidilearn extract <url>
vidilearn extract <url> -f md
```

### 2. YouTube Transcript
Get only the transcript.
```bash
vidilearn transcript <youtube-url>
vidilearn transcript <youtube-url> --print
```

### 3. Article Extraction
Get clean, distraction-free article content.
```bash
vidilearn article <url>
```

### 4. Metadata Only
```bash
vidilearn metadata <url>
```

### 5. YouTube Subtitles
List available subtitles.
```bash
vidilearn subtitles <youtube-url>
```

## Features
- **Zero API Keys:** Works entirely via scraping and local DOM parsing.
- **Auto-Detection:** Automatically identifies YouTube vs Web Articles.
- **Dynamic Fallback:** Uses Playwright for JS-rendered websites.
- **Clean Output:** Saves to `output/YYYY-MM-DD/short-title/` for easy organization.

## Development
To test changes without re-linking:
```bash
node bin/vidilearn.js extract <url>
```

## License
MIT
