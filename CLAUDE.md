# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JAUCP Scoring Tool - A Tauri 2.x desktop application that uses AI to score Japanese Uncyclopedia (日本語版アンサイクロペディア) articles. Evaluates articles on 5 criteria: humor (50pts), structure (20pts), format (10pts), language (10pts), completeness (10pts).

## Development Commands

```bash
npm install          # Install dependencies
npm run tauri dev    # Run development server with Tauri app
npm run dev          # Run Vite dev server only (no Tauri)
npm run tauri build  # Build for distribution (outputs to src-tauri/target/release/bundle/)
npm run lint         # Run oxlint
```

## Architecture

### Stack
- **Frontend**: TypeScript + Vite (vanilla, no framework)
- **Backend**: Tauri 2.x (Rust) - minimal, uses plugins for storage/opener
- **Validation**: Zod schemas + neverthrow Result types

### Source Structure
- `src/main.ts` - UI logic, event handlers, DOM manipulation
- `src/lib/` - Business logic modules:
  - `schemas.ts` - Zod schemas for all data types (Settings, ScoringResult, Model types)
  - `scoring.ts` - OpenRouter API integration + SCORING_PROMPT constant
  - `gemini.ts` - Google Gemini API integration (uses @google/genai)
  - `cerebras.ts` - Cerebras API integration with fallback model list
  - `settings.ts` - Tauri plugin-store wrapper for persistent settings
  - `wikipedia.ts` - Wikipedia API for article existence checking
  - `models.ts` - OpenRouter model list fetching

### Key Patterns

**Error Handling**: All async operations return `ResultAsync<T, Error>` from neverthrow. Use `.match()` or `.andThen()` for handling.

**Provider Pattern**: Three AI providers (openrouter, gemini, cerebras) share the same scoring prompt but have separate API modules. Each implements `fetchXModels()` and `scoreArticleWithX()` functions.

**Settings Storage**: Uses `@tauri-apps/plugin-store` to persist settings in `settings.json`. Each provider has its own API key field.

### Rust Backend (src-tauri/)

Minimal - just initializes Tauri with plugins:
- `tauri-plugin-opener` - Opens external links
- `tauri-plugin-store` - Key-value storage for settings

The Rust side only provides the shell; all business logic is in TypeScript.

### Tauri CSP (Content Security Policy)

External API/resource access is controlled by CSP in `src-tauri/tauri.conf.json` under `app.security.csp`. When adding new external services:

- **API endpoints**: Add to `connect-src` (e.g., `https://api.example.com`)
- **Images/icons**: Add to `img-src` (e.g., `https://cdn.example.com`)

Current allowed origins:
- `connect-src`: openrouter.ai, generativelanguage.googleapis.com, api.cerebras.ai, wikipedia.org
- `img-src`: svgl.app, unpkg.com
