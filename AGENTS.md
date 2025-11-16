dont add comments that are obvious or doesnt add new information
tv show page: src/pages/show/[imdbid]/[seasonNum].tsx
movie page: src/pages/movie/[imdbid].tsx
settings page: src/components/SettingsSection.tsx
refer to .env.local for environment variables
it will always help to add more logging to figure out issues, i can test it in the browser and provide logs
every error you fix, add a corresponding test to prevent regression
never place _.test._ files anywhere under src/pages (dynamic segments like [imdbid] count as routes in nextjs)
