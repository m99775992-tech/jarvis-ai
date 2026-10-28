# SETUP (Android phone only)

## Preview link (look only)
The Perplexity preview link runs a special build that **does not save anything** (that host forbids browser storage). Use it to see and try the interface. For real use, host the full `app/` folder as below.

## Use it for real
1. Open the JARVIS link in **Chrome** on your phone.
2. Chrome menu (⋮) → **Add to Home screen** / **Install app**. JARVIS gets its own icon and opens full-screen.
3. Open JARVIS once while online so it caches itself for offline use.
4. System → Voice: enable voice commands and test the voice. System → Notifications: enable.
5. System → Backup: make your first backup.

## Better JARVIS voice (free)
Android Settings → System → Languages & input → Text-to-speech output → Speech Services by Google → ⚙ → Install voice data → English (United Kingdom) → pick a male voice. Then JARVIS → System → Voice → choose it.

## Host your own permanent copy for ₹0 (optional, phone-only)
1. Create a free GitHub account in Chrome.
2. New repository `jarvis` (public) → "uploading an existing file" → upload everything inside the `app/` folder (unzip the source zip with Files by Google first).
3. Settings → Pages → Branch `main` / root → Save. Your JARVIS will be at `https://<username>.github.io/jarvis/`.

## Required permissions
Microphone (only for voice), Notifications (optional). Nothing else.
