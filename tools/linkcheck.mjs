import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW_LIST_FILE = 'tools/linkcheck.allow.json';

const dirsToCheck = ['.', 'learn', 'crate', 'desk', 'vr'];

let brokenLinks = 0;
const allowedBroken = JSON.parse(fs.readFileSync(ALLOW_LIST_FILE, 'utf8'));

const isAllowed = (source, target) => {
    return allowedBroken.some(allow => allow.source === source && allow.target === target);
};

const checkFileLinks = (filepath) => {
    const content = fs.readFileSync(filepath, 'utf8');
    const dir = path.dirname(filepath);

    const regexps = [
        /href=["']([^"']+)["']/g,
        /src=["']([^"']+)["']/g,
        /import\s+.*?from\s+["']([^"']+)["']/g,
        /import\s*\(?["']([^"']+)["']\)?/g
    ];

    for (const regex of regexps) {
        let match;
        while ((match = regex.exec(content)) !== null) {
            let link = match[1];

            // Ignore external links, data URIs, anchor links, mailto, and template literals
            if (link.startsWith('http://') || link.startsWith('https://') || link.startsWith('data:') || link.startsWith('#') || link.startsWith('mailto:') || link.includes('${')) {
                continue;
            }

            // Remove hash/search params for file resolution
            const pureLink = link.split('#')[0].split('?')[0];
            
            if (pureLink === '') {
                continue;
            }

            let targetPath;
            if (pureLink.startsWith('/')) {
                // Handle root-relative (assuming /darklabs/ is root)
                targetPath = path.join(process.cwd(), pureLink.replace(/^\/darklabs\//, ''));
            } else {
                targetPath = path.resolve(dir, pureLink);
            }

            // If it's a directory, check for index.html
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                targetPath = path.join(targetPath, 'index.html');
            }

            if (!fs.existsSync(targetPath)) {
                if (!isAllowed(filepath, pureLink)) {
                    console.error(`Broken link found in ${filepath}: ${link}`);
                    brokenLinks++;
                }
            }
        }
    }
};

for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const p = path.join(dir, file);
        if (fs.statSync(p).isFile() && (p.endsWith('.html') || p.endsWith('.js'))) {
            checkFileLinks(p);
        }
    }
}

if (brokenLinks > 0) {
    console.error(`\nFound ${brokenLinks} broken local links.`);
    process.exit(1);
} else {
    console.log('All local links are valid.');
}
