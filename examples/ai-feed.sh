#!/bin/bash

# Example: Feed a YouTube tutorial into a local file for AI context

if [ -z "$1" ]; then
  echo "Usage: ./ai-feed.sh <youtube-url>"
  exit 1
fi

URL=$1

echo "Extracting transcript from $URL..."
vidilearn transcript "$URL" > context.txt

echo "Done! Transcript saved to context.txt. You can now use this as context for your AI agent."
# Example:
# cat context.txt | llm "Summarize this tutorial"
