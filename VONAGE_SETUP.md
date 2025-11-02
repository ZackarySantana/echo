# Vonage Conversations API Integration

This document outlines the Vonage Conversations API integration that replaces the previous WebRTC P2P implementation.

## Overview

The application now uses Vonage Conversations API to handle real-time communication between presenters and attendees. This replaces all WebRTC peer-to-peer connection logic.

## Required Environment Variables

Add the following environment variables to your `.env` file:

```env
VONAGE_API_KEY=your_vonage_api_key
VONAGE_API_SECRET=your_vonage_api_secret
VONAGE_APPLICATION_ID=your_vonage_application_id
VONAGE_PRIVATE_KEY=your_vonage_private_key
```

### Getting Vonage Credentials

1. **Sign up for a Vonage account** at https://www.vonage.com/communications-apis/
2. **Create a Vonage Application**:
   - Go to https://dashboard.nexmo.com/applications
   - Click "Create new application"
   - Give it a name (e.g., "Echo Presentation App")
   - Enable "In-App Messaging" capabilities
   - Save the Application ID
   - Download the private key file
3. **Get your API Key and Secret**:
   - Go to https://dashboard.nexmo.com/getting-started-guide
   - Your API Key and Secret will be displayed

4. **Set up the private key**:
   - The private key from step 2 should be a `.key` file
   - You can either:
     - Store the full key content in `VONAGE_PRIVATE_KEY` (with `\n` for newlines)
     - Or read from the file path (requires code modification)

## What Changed

### Backend (`/src/lib/vonage.ts`)
- New utility functions for Vonage API integration
- JWT token generation for user authentication
- User creation/retrieval
- Conversation creation and management
- Member management (add/remove/list)

### Backend API Routes
- `/api/vonage/jwt` - Generates JWT tokens for clients
- `/api/vonage/conversation` - Manages conversations (create/join, list members, leave)

### Frontend (`/src/components/solid/PresentationViewer.tsx`)
- Replaced WebRTC peer connections with Vonage conversation session
- Replaced data channels with Vonage custom events
- Replaced peer discovery with conversation member polling
- Events are sent via custom events: `custom:slide-change`, `custom:poll-vote`, `custom:vote-state-sync`

### Database Schema
- Added `conversationId` field to `roomsTable` to store Vonage conversation IDs

## Features Preserved

- ✅ Slide synchronization (presenter controls, attendees follow)
- ✅ Real-time voting/polling
- ✅ Vote state persistence in database
- ✅ Connection status display
- ✅ Attendee count display

## Migration Notes

- Old WebRTC signaling endpoints (`/api/signal`) are no longer used but not removed yet
- The `webrtc.ts` file is deprecated but kept for reference
- Room codes still work the same way
- No changes needed to the presentation/room creation flow

## Testing

1. Set up your Vonage credentials as described above
2. Start your development server
3. Create a presentation room
4. Join as presenter in one browser
5. Join as attendee in another browser/incognito window
6. Verify:
   - Slide changes from presenter sync to attendees
   - Votes from attendees are reflected in real-time
   - Connection status shows correct attendee count

## Troubleshooting

### "VONAGE_APPLICATION_ID is not set" error
- Make sure all environment variables are set correctly
- Restart your development server after adding environment variables

### "Failed to generate token" error
- Verify your `VONAGE_PRIVATE_KEY` is correctly formatted
- Ensure the private key matches the application ID

### Connection issues
- Check browser console for errors
- Verify Vonage dashboard shows your application is active
- Ensure your application has "In-App Messaging" capability enabled

### Custom events not working
- The implementation falls back to text messages if custom events fail
- Check the Vonage dashboard for any API errors

## Next Steps (Optional Cleanup)

1. Remove old WebRTC signaling endpoint (`/src/pages/api/signal.ts`)
2. Remove or archive `webrtc.ts` file
3. Remove WebRTC-related dependencies if not used elsewhere

