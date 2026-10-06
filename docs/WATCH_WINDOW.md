# Watching a Coin work

Open **Coins → a Coin → Overview**. The viewing window is already on the profile. **Open full workspace** or the **Live** tab opens detailed operations, costs, evidence and receipts.

The screen shows actual frames captured by the worker's isolated browser. The adjacent **Right now** panel reports the Coin's current task or waiting state; **Recent actions** lists recorded runtime events. These are observable actions, not private model reasoning.

## Screen controls and states

- **LIVE** means the selected current browser session is running and the viewer is following its newest frame.
- **STANDBY** keeps the window visible before a permitted frame is available. It displays **Awaiting browser activity** and explains that recorded sessions will appear when available. This does not claim the Coin is currently browsing.
- **LAST CAPTURE** means the page is retained from a recorded session. It does not claim the Coin is still on that page.
- **Replay captures**, previous/next and thumbnails review that session's real frames. **Follow latest** resumes following new captures.
- **Zoom page** enlarges the captured page to readable resolution, with scrolling inside the screen. **Fit page to screen** restores the fitted view. **Expand screen** uses browser fullscreen.
- **Coin now** remains separate from the recorded page. A Coin may be analyzing evidence, waiting for a supplier, or waiting for useful new work while its previous page stays visible.

Every Coin keeps its viewing window on Overview and Live, including Coins with no browser history. **Current work** opens the operation's detailed stage or waiting state; Search, Sources and Output remain available when recorded. Search-only and model-only work does not invent browser images. Private sessions retain their privacy message. Expired or unavailable frames display an explicit message.

## How live it is

Frames arrive at actual browser milestones, such as opening a page and scrolling to evidence. The existing live refresh is approximately three seconds. This is a frame-based viewing window, not a continuous video stream or remotely controllable desktop. Replay advances through recorded frames only.

The browser displays real retrieved HTML in a safe reader layout. Page scripts, service workers, external assets and secondary requests are blocked, so the original site's styling and interactive widgets may differ or be absent. The same domain permissions, public-IP validation, response bounds and spending checks apply.

## Privacy and operation

Capture visibility follows the original job's authorization. Public visitors see permitted public business sessions; private and supplier work does not become public through retained replay. Historical job selection stays within that job. Images are delivered through the authorized capture endpoint with no-store responses; private storage URLs are not exposed.

Captures expire after 24 hours. Existing bounds remain 12 frames per run, 36 per job, 1,000 retained globally, and 256 KiB per frame. The local installation now uses its existing Edge browser through `BROWSER_PROVIDER=local`; no new provider account is required. Hosted environments still require their own configured renderer and private capture storage.

Local evidence and reviewed screenshots: `qa/watch-window/REVIEW.md`; persistent-window follow-up: `qa/snapshot-window/REVIEW.md`. No public deployment, paid-model acceptance or mainnet activity is implied by the local browser test.
