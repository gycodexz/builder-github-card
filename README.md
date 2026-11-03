# Github Builder Card Web App

Enter a GitHub username and get a profile card with top repos and recent activity (top 5), and main languages.

**Live demo link:**

## # Features ->

The website shows the following things:- 

- Profile: avatar, name, bio, followers, following, repository count.
- Top 5 repos by stars (forks excluded), with their respective links.
- Top languages by number of repos, shown like github shows.
- Last 5 public activity events (pushes, stars, forks, PRs and issues).
- Loading state and clear errors for:
    1. unknown user,
    2. rate limit (with reset time), and
    3. network failure using JS logic.
- Empty states for users with no repos, languages or activity.

## # Tech ->
- **HTML** and **CSS** for structure and UI
- **Vanilla JavaScript** for responsiveness and logic.
---
Data comes from the public Github REST API in app.js file (`/users/{u}`, `/users/{u}/repos`, `/users/{u}/events/public`).

## How to Run (locally) ->
1. Add all files (index.html, style.css and app.js) in the same folder.
2. Open `index.html` in a browser

## # Approach ->
`app.js` is has four sections:
1. API layer: <br>
One `fetchJSON` helper that converts HTTP failures into a custom `ApiError`.
2. Core logic: <br> 
Pure functions (`getTopRepos`, `getLanguageStats`, `getRecentActivity`) with no DOM access.
3. Rendering: <br>
Functions that write data into the page using `textContent` (never `innerHTML` with API data).
4. Events: <br>
One submit handler with `try/catch/finally` block.

## Limitations and next steps
- Unauthenticated GitHub API allows 60 requests/hour per IP. Each search uses 3.
- Only the first 100 repos are analysed.
- Language stats count repos by primary language, not bytes of code.
- Next step: a small serverless proxy with a token to raise the rate limit.

## Time taken
1 hour 30 minutes