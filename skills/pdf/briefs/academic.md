{% raw %}# Brief: Academic Production

Scholarly documents via LaTeX/Tectonic: academic papers, theses, dissertations, mathematical manuscripts, IEEE/ACM submissions, academic CVs.

```
Academic request
  ├─ Paper / thesis / journal          → §Standard Paper Workflow
  │     Embed as needed during Phase 3:
  │     ├─ Heavy math (>3 equations)   → use §Scenario A preamble + environments
  │     ├─ Vector diagrams             → §Scenario B (simple→TikZ, complex→Playwright+CSS)
  │     └─ Algorithm pseudocode        → use §Scenario C template
  │
  └─ Standalone diagram for other brief → §Scenario B Path B (Playwright+CSS → PNG)
  │
  └─ Resume / CV
        ├─ Creative / tech / startup   → §Template A (AltaCV dual-column)
        └─ Academic position / PhD     → §Template B (Academic CV)
```

**No typesetting assets needed** - LaTeX templates handle their own design system. The `palette.md` color system does not apply to LaTeX documents.

---

## §Standard Paper Workflow

Six phases. Rules and guardrails are embedded in each phase where they apply.

### Phase 1 - BRIEF

Confirm with the user:
- Document type (journal article, thesis chapter, conference paper, technical report)
- Template requirement (IEEE, ACM, custom class, or plain `article`)
- Bibliography format (natbib superscript, numeric brackets, biblatex)
- Expected length → if >5 pages or 3+ complex elements (wide tables, block equations, TikZ), split into `\input{}` modules (~500 lines each)

**Recognising the document's personality:**

| Personality | Examples | Key concern |
|-------------|----------|-------------|
| Scholarly | Journal articles, conference proceedings | Academic conventions, bibliography accuracy |
| Utilitarian | Technical reports, manuals, specs | Information density + scannability |
| Persuasive | Proposals, pitch documents | Professional polish + 1-2 visual high-points |
| Expressive | Portfolios, brand guidebooks | Bold typographic choices |

### Phase 2 - SETUP

**Title Page (Cover) Rules:**
- **Academic route covers are generated via HTML/Playwright**, using Templates 08-11 from `typesetting/cover.md`. Templates 08-10 replicate LaTeX title page aesthetics (dark backgrounds, serif typography)
- **Pipeline:** Generate body PDF via Tectonic (no title page in `.tex`) → Generate cover HTML (Template 08/09/10/11) → Playwright `page.pdf()` → Merge cover as page 0 via pypdf
- **Template selection:** For thesis proposals (开题报告), dissertations (毕业论文), and institutional submissions → **default to Template 11**. For research papers, preprints, journal submissions → Template 08 or 09
- **NEVER use `\maketitle`** - it produces ugly default output with cramped spacing
- **NEVER use `\begin{titlepage}...\end{titlepage}`** - the cover is generated separately via HTML/Playwright
- **NEVER use LaTeX TikZ overlay for full-page covers** - TikZ `current page` coordinates are unreliable with `margin=0pt`, causing backgrounds to not fill the page (right/bottom white edges). Use HTML/Playwright instead.
- Title page is OPTIONAL - skip it for short documents (≤ 2 pages), letters, memos, or when content scanning is priority
- **`\tableofcontents` must be the FIRST page** of the body PDF (after merge, it becomes page 2)
- If no TOC, content starts on page 1 of the body PDF

**Cover Generation Pipeline (Academic route):**
```
1. Write .tex WITHOUT any title page
2. Run poster_validate.py check-tex on .tex file - fix table overflow / image width ERRORs
3. Compile with tectonic → body.pdf
4. Write cover HTML using Template 08/09/10/11 from typesetting/cover.md (Template 11 for thesis proposals/dissertations)
5. Run poster_validate.py check-html on cover HTML - fix any ERRORs
6. Run cover_validate.js on cover HTML - fix any text-line overlaps
7. Render cover HTML → PDF via Playwright (`html2poster.js`) — **NOT `html2pdf-next.js`** (which converts absolute→static and destroys cover layout)
8. Merge: insert cover as page 0 of body PDF via pypdf
```

**Cover HTML → PDF rendering:**
```bash
# ALWAYS use html2poster.js for cover rendering (NOT html2pdf-next.js)
# Cover pages use position:absolute layout — html2pdf-next.js pre-render hooks
# convert absolute→static and destroy the layout. html2poster.js preserves it.
node "$PDF_SKILL_DIR/scripts/html2poster.js" cover.html --output cover.pdf --width 794px
```

Or from Python:
```python
import subprocess, os

def render_cover(html_path, pdf_path):
    """
    Render HTML cover to PDF via html2poster.js.
    
    ⚠️ ALWAYS use html2poster.js for covers (NOT html2pdf-next.js).
    Cover HTML uses position:absolute for layout. html2pdf-next.js pre-render
    hooks convert absolute→static to prevent multi-page overlap, which
    destroys cover layouts. html2poster.js preserves absolute positioning.
    """
    scripts_dir = os.path.join(PDF_SKILL_DIR, 'scripts')  # PDF_SKILL_DIR from SKILL.md § Script Path Setup
    subprocess.run([
        'node', os.path.join(scripts_dir, 'html2poster.js'),
        html_path, '--output', pdf_path,
        '--width', '794px',
    ], check=True)
```

**Merge cover + body:**
```python
from pypdf import PdfReader, PdfWriter, Transformation

A4_W, A4_H = 595.28, 841.89  # A4 in points

def normalize_page_to_a4(page):
    """Scale a page to A4 if its dimensions don't match."""
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 2 or abs(h - A4_H) > 2:
        sx, sy = A4_W / w, A4_H / h
        page.add_transformation(Transformation().scale(sx=sx, sy=sy))
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

writer = PdfWriter()
cover_page = normalize_page_to_a4(PdfReader('cover.pdf').pages[0])
writer.add_page(cover_page)
for page in PdfReader('body.pdf').pages:
    writer.add_page(page)
with open('final.pdf', 'wb') as f:
    writer.write(f)
```

**→ Full cover templates: see §PART 4.5 in `typesetting/cover.md` (Templates 08-10).**

> **⚠️ Why HTML/Playwright covers?** LaTeX TikZ `remember picture, overlay` with `margin=0pt` frequently fails to fill the page (right/bottom edges show white). HTML/CSS with `@page { margin: 0; }` is reliable.

Write the preamble. Start from this foundation and customise per document:

```latex
\documentclass{article}

\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{geometry}
\usepackage{amsmath}          % Load before hyperref

% hyperref - ALWAYS last among content packages
\usepackage[
    colorlinks=true,
    linkcolor=blue,
    citecolor=darkgray,
    urlcolor=blue,
    bookmarks=true,
    bookmarksnumbered=true,
    unicode=true
]{hyperref}

\geometry{a4paper, top=2.5cm, bottom=2.5cm, left=2.5cm, right=2.5cm}
% ⚠️ left and right MUST be equal - asymmetric margins cause off-center content

\usepackage[numbers,super,sort&compress]{natbib}
\bibliographystyle{unsrtnat}

\usepackage{tcolorbox}
\usepackage{colortbl}
\usepackage{booktabs}
\usepackage{enumitem}
\usepackage{tabularx}          % Auto-width columns (X type) - prevents table overflow
\usepackage{adjustbox}         % \adjustbox{max width=\columnwidth} for emergency table fitting
```

**Guardrails for SETUP:**
- `hyperref` must load after virtually every other package - option clashes are the #1 preamble bug
- When using a Scenario template (A/B/C) or Resume template, use that template's own preamble instead
- `babel` and `polyglossia` are incompatible - load only one
- CJK: `\usepackage{ctex}` - Tectonic auto-downloads fonts, zero manual setup
- System fonts via `\setmainfont{}`: probe first with `fc-list :lang=XX`
- **🔴 Margin symmetry:** `\geometry{left=X, right=X}` - left and right MUST be equal. Asymmetric margins = off-center content = critical bug
- **🔴 Minimum margins with fancyhdr:** When using `fancyhdr` for headers/footers, `geometry` margins must leave enough room. **Minimum: `top >= 2.0cm`, `bottom >= 1.8cm`**. Also set `\setlength{\headheight}{14pt}`
- **🔴 Quotation marks (English):** NEVER use straight quotes `"..."`. English text must use LaTeX curly quotes: `` ``left quote'' `` for double, `` `single' `` for single. Straight `"` in LaTeX renders as right quotes only.
- **🔴 Quotation marks (Chinese — CRITICAL):** Chinese quoted text like "北漂" MUST use Unicode smart quotes "…" (U+201C/U+201D) directly in the `.tex` source. **NEVER use ASCII `"` for Chinese text.**
  - **Scope:** This rule applies ONLY to Chinese-language body text. Do NOT replace `"` in English paragraphs (use `` ``...'' `` instead), `verbatim`/`lstlisting`/`minted` environments, `\texttt{}` blocks
- **🔴 Title page isolation:** Cover is generated via HTML/Playwright and merged as page 0 via pypdf - isolation is inherent in the merge pipeline. `\tableofcontents` should be the first page of body PDF
- **🔴 TOC requires a cover page:** Unless the user explicitly requests no cover, if the document has `\tableofcontents`, it MUST have a cover page. Structure: Cover (page 1) → TOC (page 2) → Body (page 3+)

**When no style is specified**, apply a measured, high-craft system:
1. **Contrast** - clear figure-ground separation
2. **Hierarchy** - size, weight, hue variation for reading order
3. **White space** - ample margins and leading
4. **Coherence** - one typeface family, one accent colour, one spacing rhythm

Add enrichment proactively when content benefits:
- Callout boxes, sidebars → `tcolorbox`
- Theorem/definition/proof → `amsthm` + `tcolorbox`
- Headers/footers → `fancyhdr`; chapter openers → `titlesec`
{% endraw %}