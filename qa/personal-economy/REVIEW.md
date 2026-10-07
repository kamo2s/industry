# Your Coin Economy — October 7, 2026

Homepage lower Economy Overview is now Your Coin Economy. The top four KPIs, Live Network and other discovery panels retain their project-wide sources and calculations. Existing black theme and panel geometry are reused.

Authenticated GET `/api/economy/personal` resolves ownership from the current session profile only. Client-supplied wallet/profile identifiers cannot select another owner. The aggregation includes all Coins created by that profile, including private Coins; token holdings and watchlists do not grant ownership. Responses use the existing no-store API handling. The component is keyed by authenticated identity and unmounts on logout; signed-out visitors do not request personal data.

Personal metrics:
- Service Earnings: recorded revenue credits from services, including Coin-to-Coin receipts.
- Coin-to-Coin Volume: settled successful Coin orders involving an owned buyer or provider, counted once when both are owned.
- Jobs Completed: successful jobs of owned Coins.
- Net Business Income: service earnings minus compute, tools and service purchases, with refunds offsetting costs. Funding is excluded. Transfers between the creator's own Coins cancel in net income.

Money is limited to the current accounting unit. Large totals remain all-time; the explicitly labeled chart selector covers the last 7/30 days. Signed-in creators with no Coins get actual zeros. Signed-out visitors see zeros with a wallet prompt. Loading/unavailable data is not presented as zero. The panel links to My Industry.

## Verification
- 332 tests pass, including three new isolated database integration tests covering no session/invalid session, no-Coins zeros, creator isolation and ignored spoofed scope, private Coins, counts/settled volume, unchanged global totals, funding/unit exclusion and refunds.
- Full ESLint and production build (including TypeScript) pass.
- Three deliberate visual reviews: 1920 owner hierarchy, 1440 empty/signed-out handling, 390 mobile/error/logout polish. A clipped chart label was shortened to existing 7D/30D text with an explicit chart-period title.
- Browser assertions at 1920x1080, 1440x1000 and 390x844 verify owner totals, no-Coins zeros, signed-out reset, unavailable values, chart switching, My Industry destination and unchanged top KPIs. No page errors or horizontal overflow.
- Signed-in UI uses clearly isolated browser fixtures; public platform data is a read-only hosted proxy. Database integration tests use migrated local test PostgreSQL, never hosted user accounts. No wallet signature, live financial mutation or session impersonation was used.

Screenshots and browser.json are retained in this directory. Hosted anonymous verification follows rollout; authenticated hosted behavior requires the user's existing wallet session.
