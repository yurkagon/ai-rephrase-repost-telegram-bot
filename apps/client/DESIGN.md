---
name: CopywriteRepostBot
description: Compact Telegram-inspired workspace for reviewing channel publications
colors:
  accent: '#087abb'
  accent-dark: '#08669c'
  focus: '#168acd'
  ink: '#172b3a'
  muted: '#526574'
  surface: '#ffffff'
  canvas: '#edf3f7'
  border: '#dce5eb'
  rail: '#e8f0f5'
  nav-selected: '#d4e8f5'
  row-selected: '#e2f0fa'
  preview: '#e3f2fc'
  secondary: '#eef4f8'
  secondary-hover: '#dfebf3'
  ai-action: '#dfedf8'
  ai-action-hover: '#cce4f5'
  editor-border: '#c8d8e4'
  status-neutral: '#edf2f5'
  status-success-ink: '#226746'
  status-success: '#e2f3e8'
  status-progress: '#e3f1fc'
  status-warning-ink: '#983f28'
  status-warning: '#fff0e8'
  error-ink: '#9e332e'
  error-surface: '#fff0ef'
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '26px'
    fontWeight: 650
    letterSpacing: '-0.025em'
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '17px'
    fontWeight: 600
  message:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '15px'
    lineHeight: 1.65
  action:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '14px'
    fontWeight: 600
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '13px'
    fontWeight: 550
  status:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '11px'
rounded:
  status: '4px'
  control: '8px'
  editor: '10px'
  message: '12px 12px 12px 3px'
  dialog: '14px'
  avatar: '50%'
spacing:
  small: '8px'
  compact: '12px'
  regular: '16px'
  message-inline: '20px'
  section: '24px'
  action-bar-inline: '28px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    typography: '{typography.action}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
  button-primary-hover:
    backgroundColor: '{colors.accent-dark}'
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.accent-dark}'
    typography: '{typography.action}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
  button-secondary-hover:
    backgroundColor: '{colors.secondary-hover}'
  button-ai:
    backgroundColor: '{colors.ai-action}'
    textColor: '{colors.accent-dark}'
    typography: '{typography.action}'
    rounded: '{rounded.control}'
    padding: '10px 16px'
  button-ai-hover:
    backgroundColor: '{colors.ai-action-hover}'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '9px 12px'
    width: '100%'
  navigation-current:
    backgroundColor: '{colors.nav-selected}'
    textColor: '{colors.accent-dark}'
    rounded: '{rounded.editor}'
    padding: '12px 2px'
    width: '100%'
  status-success:
    backgroundColor: '{colors.status-success}'
    textColor: '{colors.status-success-ink}'
    typography: '{typography.status}'
    rounded: '{rounded.status}'
    padding: '3px 6px'
  message:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.message}'
    rounded: '{rounded.message}'
    padding: '18px 20px'
  message-preview:
    backgroundColor: '{colors.preview}'
---

# Design System: CopywriteRepostBot

## Overview

**Creative North Star: "Telegram-inspired editorial workspace"**

Telegram Desktop is the approved visual authority: compact channel lists, blue actions, light surfaces, and legible messages. CopywriteRepostBot keeps its own Copywrite wordmark and circular send mark. This is an operating interface whose visual hierarchy follows the editor's work.

White lists and controls sit beside a pale blue-gray reading canvas. The source, editable draft, and tinted target preview remain distinct. UI language and generated output language are independently selected between Ukrainian and English.

**Key Characteristics:**

- Compact navigation and inbox beside a readable message workspace.
- Blue actions and selection states on light, mostly flat surfaces.
- Source, draft, and target preview with deliberate publishing confirmation.
- Truthful loading, empty, error, permission, and publication states.

Evidence: extracted from `src/styles/globals.css` and the client components. The selected Ukrainian workspace draft was visually reviewed in the repository's `.impeccable/review/desktop.png` and `mobile.png`. Authentication, channels, routes, history, metrics, account, media, and confirmation states were source-reviewed; these captures do not establish their rendered quality, live AI output quality, or end-to-end Telegram delivery.

## Colors

The palette uses a clear blue accent, cool light neutrals, and restrained semantic state colors. Frontmatter holds the normative values. Sidecar tonal ramps are synthesized display aids, not additional implemented palette tokens.

### Primary

- **Action Blue** (`accent`): filled publishing and form actions, chosen rating, caret, checkbox, and brand mark. The implemented action color replaces the earlier documented `#168acd` to give white button text sufficient contrast.
- **Deep Blue** (`accent-dark`): primary hover, links, secondary actions, selected navigation, and target-channel preview text.
- **Focus Blue** (`focus`): the distinct keyboard outline and inset editor focus treatment; it remains brighter than the action fill.
- **Soft Blue** (`ai-action`, `ai-action-hover`, `preview`, `nav-selected`, `row-selected`): AI actions, outgoing preview, navigation, and inbox selection. Their different tints identify context without adding another action hue.

### Neutral

- **Ink** (`ink`) and **Muted Slate** (`muted`): message content and supporting labels respectively.
- **White Surface** (`surface`), **Reading Canvas** (`canvas`), and **Navigation Rail** (`rail`): list/control, reading, and navigation layers.
- **Divider** (`border`) and **Editor Stroke** (`editor-border`): pane separators, fields, and the editor boundary.
- **Secondary Surface** (`secondary`, `secondary-hover`): lower-priority controls.

Status labels pair text and tone: neutral gray, green for draft/published, blue for generation/publication in progress, and warm warning for failure or uncertain publication. Errors use a separate pale red notice. State color accompanies visible text.

**The Action Contrast Rule.** Use Action Blue for white-text filled actions; keep Focus Blue for focus treatment.

## Typography

**Interface and message font:** the platform UI stack recorded in frontmatter. The approved desktop application character uses familiar native interface typography, with emphasis carried by size and weight.

### Hierarchy

- **Headline:** 26px, semibold (650), slightly tightened; general page headings. The inbox specializes this to 23px.
- **Title:** 17px, semibold (600); section headings. Workspace source/draft/preview labels specialize to 13px.
- **Message:** 15px at 1.65 line-height; original, edited content, and preview.
- **Action:** 14px, semibold (600); principal controls and inbox channel names.
- **Label:** 13px, medium (550); field labels. Hints and excerpts use the same size with regular weight.
- **Status:** 11px; state badges and list timestamps. Desktop rail labels use 10px and mobile uses 9px with 1.2 line-height.

The authentication story uses a 42px headline at 1.14 line-height; it is hidden on mobile. Metrics values use tabular numerals. Message text preserves whitespace, wraps long content, and permits inline formatting and links.

**The Content First Rule.** Preserve readable message type and text-based state labels when the surrounding interface becomes compact.

## Layout

The desktop shell fills `100dvh`: an 86px navigation rail, a 340px inbox, and a flexible detail pane. A white 75px detail header and white action footer frame the independently scrolling canvas. Detail content is capped at 850px and normally padded 24px by 32px. Source, AI options, draft, preview, versions, and rating follow a vertical reading sequence rather than competing columns.

At 1100px and below, the inbox narrows to 290px, detail padding becomes 20px, and four AI option columns become two. At 760px and below, a 74px bottom navigation replaces the rail; the inbox and selected detail become sequential full-width panes with an explicit back control. Mobile detail padding is 20px by 14px, message padding is 15px, and the publication footer remains outside the detail scroll.

Settings use a centered 1050px maximum container with 35px by 40px padding, reduced to 24px by 18px on mobile. Account narrows to 700px. Common form columns stack on mobile, while registration's name fields retain two columns. Spacing uses repeated 8px, 12px, 16px, 20px, and 24px steps with contextual 28px action-bar padding.

## Elevation & Depth

Depth comes primarily from background tints and single-pixel dividers. Messages, lists, and fields are flat at rest. The confirmation dialog is the elevated exception: `0 16px 60px #172b3a33`, with `#172b3a66` behind the native modal. The editor focus treatment is an inset 2px Focus Blue stroke, not a decorative shadow.

**The Flat Workspace Rule.** Use tonal layers and dividers for the operating workspace; reserve elevation for modal confirmation.

The only explicit animation is the loading spinner: one second, linear, continuous rotation. Reduced-motion preference disables it. There are no authored hover transitions to inherit.

## Shapes

Controls use 8px corners; status badges use 4px; editor and selected navigation use 10px. Original and preview messages share the asymmetric `12px 12px 12px 3px` silhouette, identifying a message without extra decoration. The modal uses 14px corners. Brand, channel, and account avatars are circular. Inbox rows remain full-width rectangles.

## Components

### Buttons

Compact, legible controls with a 42px minimum height, 10px by 16px padding, and an 8px gap between icon and label. Primary actions are white on Action Blue with Deep Blue hover. Secondary actions are Deep Blue on Secondary Surface; AI generation has its own Soft Blue treatment. Icon controls use 10px padding. Disabled buttons have 0.6 opacity and a default cursor.

All standard keyboard controls receive a 3px Focus Blue outline offset by 3px. Icons use SVG and retain visible text or accessible names.

### Status badges

Small text labels with 3px by 6px padding and 4px corners. Keep backend status text alongside its neutral, green, blue, or warning tint; uncertain publication must remain visibly distinct from success.

### Cards / Containers

Message containers use the shared asymmetric shape and message typography, with white for the original and light blue for the target preview. Reuse these message surfaces rather than turning each workspace section into a separate raised card. Settings use open rows divided by borders; connection guidance uses a tinted panel.

### Inputs / Fields

Native inputs and selects have a 42px minimum height, white background, single-pixel Divider stroke, 8px corners, and 9px by 12px padding. Labels sit 7px above fields. Focus changes the border to Action Blue and preserves the shared keyboard outline. AI mode, output language, tone, and length use the common options grid; translation disables tone and length.

### Navigation

Desktop icons and small labels stack in the rail. Selected navigation uses a light blue rounded surface and Deep Blue text; hover uses a separate cool tint. Current pages expose `aria-current`. Mobile navigation remains labeled, with six evenly distributed destinations. The desktop rail includes UI language and logout; both remain available on the account screen when the rail footer is hidden on mobile.

### Review and publication workspace

Inbox rows combine circular channel initials, channel name, timestamp, excerpt, and status. The detail pane distinguishes original, editable draft, and target-channel preview. Photo/video media and album captions appear in both original and preview; unavailable media has a text fallback. Media fits within the message at a 360px maximum height without cropping.

The editor offers SVG formatting controls with accessible labels, an inset focus stroke, and pressed states for supported toggles. Versions disclose on demand. Rating uses five explicit numeric choices. Save and publish actions occupy the footer; publish is enabled only for a saved draft with no unsaved edits, then opens a named native modal showing the target channel. Navigation guards unsaved changes. Uncertain publication requests a channel check and explicit resolution.

### Feedback and metrics

Errors use an alert region and a red-tinted notice. Loading uses a status region. Empty states pair concise explanation with a next action where available. Metrics show API-provided counts, duration, and rating; absent averages read as no data. Preserve these states without substituting decorative charts or invented activity.

## Do's and Don'ts

### Do:

- **Do** keep blue actions, pale reading surfaces, and compact native-style controls.
- **Do** distinguish original, editable draft, and target preview through labels and surface tint.
- **Do** keep UI language independent from the output language.
- **Do** preserve keyboard focus, accessible control names, status text, and mobile access to logout.
- **Do** show media with its captions and require a saved draft plus confirmation before publication.
- **Do** report actual data and explicit loading, empty, error, and uncertain states.

### Don't:

- **Don't** use the brighter focus color for white-text primary action fills.
- **Don't** add decorative charts, invented metrics, or unsupported claims about AI output.
- **Don't** compress desktop columns into a mobile side-by-side workspace.
- **Don't** conceal unsaved edits or present uncertain publication as completed.
