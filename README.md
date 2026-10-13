# Jeopardy Classroom Review Game

## About
An interactive Jeopardy-style review game designed for classroom instruction, particularly ESL students.

## Play Online
https://marknj75.github.io/quiz-board/

## Features
- 2–6 teams with automatic scoring
- Customizable categories and questions
- Daily Doubles with wagers
- Countdown timer and sound effects
- Steal Mode
- Saved games
- Import and export game templates

## Running the Game Locally

1. Open Command Prompt in the Jeopardy folder.
2. Enter:

   ```cmd
   python -m http.server 8000
   ```

3. Open Chrome and navigate to:

   http://localhost:8000/index.html

4. Keep Command Prompt running while playing.

## Moving Games Between Computers

**Export:**
1. Open the Teacher Game Builder.
2. Complete the categories and questions.
3. Click **Export Game**.
4. Save the downloaded JSON file to Google Drive or a USB drive.

**Import:**
1. Open Jeopardy on another computer.
2. Click **Import Game**.
3. Select the saved JSON file.
4. Start the game.

## Important Notes
- Saved games are stored in the browser and do not automatically synchronize between computers.
- Exported templates preserve categories, clues, answers, and Daily Doubles, but not scores or completed tiles.
- Keep the MP3 sound files in the game folder when running locally.
- The GitHub version is the working master.

## Source Code
https://github.com/MarkNJ75/quiz-board

Last updated: October 2026
