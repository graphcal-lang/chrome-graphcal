# Privacy

Graphcal for GitHub reads GitHub repositories on behalf of the Graphcal viewer at graphcal.org, using the GitHub sign-in already in your browser.

- The extension sends requests to github.com (and raw.githubusercontent.com, where GitHub serves file contents) only, with the cookies your browser already holds for GitHub. It never reads, stores or transmits those cookies itself.
- The extension stores nothing: no settings, no history, no copies of repository contents.
- Repository contents are handed to the page at graphcal.org that asked for them, in your browser, and are evaluated there. They are not sent to graphcal.org's server or anywhere else.
- Only pages on graphcal.org can ask the extension to read a repository.
- The extension collects no analytics and contains no third-party code that runs at install or use.
