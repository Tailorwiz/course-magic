# Course Magic

AI-powered course generation platform that transforms ebooks, ideas, and notes into full video courses with AI-generated images and narration.

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL with Drizzle ORM (Supabase/Neon)
- **Storage:** Google Cloud Storage for media files
- **AI Services:**
  - OpenAI - Chat/text generation
  - Replicate (Flux models) - Image generation
  - ElevenLabs - Voice narration with word timestamps

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── App.tsx           # Main React app
│   │   ├── api.ts            # API client layer
│   │   ├── types.ts          # TypeScript interfaces
│   │   ├── constants.ts      # App constants & defaults
│   │   ├── utils.ts          # Helper functions
│   │   ├── components/       # Reusable UI components
│   │   ├── views/            # Page components
│   │   └── index.tsx         # Entry point
│   └── index.html
├── server/
│   ├── index.ts              # Express server & API routes
│   ├── db.ts                 # Drizzle database connection
│   ├── objectStorage.ts      # Google Cloud Storage service
│   └── objectAcl.ts          # Storage access control
├── shared/
│   └── schema.ts             # Database schema (Drizzle)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Environment Variables

Create a `.env` file with:

```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
REPLICATE_API_TOKEN=r8_...
ELEVENLABS_API_KEY=...
GCS_BUCKET_NAME=...
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account",...}
```

## Setup

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

## Features

- 📚 Generate courses from ebooks, PDFs, or text input
- 🎨 AI-generated visuals for each lesson
- 🎙️ AI voice narration with word-level timestamps
- 📈 Student progress tracking
- 🎓 Certificate generation
- 👥 Multi-user support (Admin, Instructor, Student roles)
- 🎫 Support ticket system

## Migration Notes

This project was migrated from Replit. The AI integration layer (`server/replit_integrations/`) needs to be replaced with direct API calls to:
- OpenAI API for chat completions
- Replicate API for Flux image generation
- ElevenLabs API for text-to-speech

## Deployment

Deployed on Railway with automatic deploys from GitHub.

## License

Private - All rights reserved
