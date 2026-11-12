# SortLab

Free sorting algorithm visualizer: 33 algorithms, 12 styles (including 3D), sound, battles and a vertical video maker. No build step, no server, no accounts.

## Put it online

It's a plain static site. Upload all the files. There are no subfolders.

**GitHub Pages**
1. Make a new repository and upload all the files.
2. Go to Settings > Pages.
3. Under "Branch" pick `main` and `/ (root)`, then Save.
4. Your site appears at `https://yourname.github.io/repo-name/` after a minute.

**Vercel**
1. Push the folder to GitHub.
2. On vercel.com click Add New > Project and pick the repo.
3. Framework: "Other". Leave build settings empty. Deploy.

**Cloudflare Pages**
1. Workers & Pages > Create > Pages > Upload assets.
2. Drag the folder in and deploy.

## Try it on your computer

Double-click `index.html`. Everything works except video recording in some browsers, which needs the site to be online (or run `python -m http.server` in the folder and open `http://localhost:8000`).

## Notes

- Video recording works best in Chrome or Edge (saves MP4). Firefox saves WebM.
- Videos record in real time, so keep the tab open and visible until it finishes.
- Photos you add stay in your browser and are never uploaded.
