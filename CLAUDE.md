# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, Lint & Test Commands
- Supabase Start: `npx supabase start`
- Supabase Status: `npx supabase status`
- Deno Lint: `cd supabase/functions && deno lint`
- Deno Format: `cd supabase/functions && deno fmt`

## Code Style Guidelines
- TypeScript-first with explicit types
- Function comments using JSDoc style
- 2-space indentation, no tabs
- 80 character line width
- Single quotes for strings
- Early returns to avoid nested conditions
- Functional and immutable programming style
- Descriptive variable names (handle* prefix for event handlers)
- Proper error handling with standardized error responses
- Minimal code changes - modify only what's necessary

## Project Structure
- Edge Functions in supabase/functions/
- SQL migrations in supabase/migrations/
- Shared validation and CORS utilities in _shared/
- Row Level Security (RLS) for database tables