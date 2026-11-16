# Nexus

Nexus is an independent social platform project.

## Preview

Open the site and select **Admin** on the login screen to enter the temporary preview.

The current preview includes:
- Home, Friends, Chambers, Messages, and Settings navigation
- Chamber creation, channel creation, and local channel messages
- Chamber search, editing, and deletion
- Local display-name editing
- Outgoing friend-request preview

Preview data is saved in the current browser only. It is not shared with other users or devices.

## Current status

This is a frontend prototype. Login is not connected to an authentication provider yet. Friend requests, presence, direct messages, and Chambers are not connected to a shared backend.

## GitHub Pages

To publish from this repository, open **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/(root)`.

## Planned backend

The next major step is Supabase:
- Authentication and user profiles
- Friend requests and relationships
- Chambers, memberships, and channel permissions
- Persistent messages and online presence

Keep Supabase service-role keys out of the browser and out of this repository.
