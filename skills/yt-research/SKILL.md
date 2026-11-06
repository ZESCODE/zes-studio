---
name: yt-research
category: Media
description: YouTube Shorts topic research and idea generation — trend discovery, viral pattern scoring (hook/loop/comment/share/evergreen), and full idea dossiers (titles, hook script, beats, visual cues, CTA, hashtags, posting time, variations). Use when planning, batching, or brainstorming Shorts for a facts/niche channel before rendering with zes-studio.
---

# YouTube Shorts Research Skill

## Purpose
Research trending topics, analyze viral patterns, and generate high-potential YouTube Shorts
ideas tailored to a niche — feeding straight into the zes-studio kinetic-typography pipeline.

## Input Required
- Target niche/channel theme (e.g. "5 facts daily" — geography, history, science, animals)
- Target audience demographics (age, region, language)
- Content style preference (educational, entertainment, inspiration)
- Posting frequency goal (drives batch size — generate 2–3× the weekly quota)

## Research Process

### 1. Trend Discovery
- YouTube Trending + Shorts feed in the niche
- TikTok Creative Center, Instagram Reels Explore
- Google Trends for rising niche queries
- Competitor channels: their best-performing Shorts from the last 30–90 days
- Niche subreddits, X/Twitter, Discord communities
- Tools available here: the `agent-reach` skill for web/social search; 9Router web search
  (`zes-9router-web-search`) for SERP-level signals; Wikipedia "Did you know" and
  page-view spikes for evergreen fact candidates

### 2. Viral Pattern Analysis
For each candidate topic, score 0–10 on:

| Dimension | What it measures |
|---|---|
| **Hook strength** | First-3-second retention potential |
| **Loop potential** | Rewatch / "wait, what?" / save behavior |
| **Comment bait** | Controversy, disbelief, "that's fake" arguments |
| **Shareability** | "Send to a friend" factor |
| **Evergreen vs trend** | Shelf life (10 = timeless) |

## Output Format
Each topic includes:
- **Title options** (3 variants: clicky, descriptive, question)
- **Hook script** (first 3 seconds, <50 words)
- **Structure** (beat-by-beat 15–60 s outline)
- **Visual cues** (text overlays, B-roll, transitions)
- **CTA strategy** (comment prompt, follow hook, series tease)
- **Hashtag set** (5–8 niche + 2–3 broad)
- **Posting time recommendation**
- **Variation ideas** (Part 2, response to comments, behind the scenes)

For the "top 5 facts about X" format used by this channel:
- Topic = X (a country, animal, historical figure, object, place)
- The **number-one fact must be the strongest** — it is the hook
- Prefer facts with a hard stat (number/mileage/weight) for the stat badge
- One "wait, that's illegal/impossible" fact per video drives comments

## Quality Gates
- Minimum composite score: **35/50**
- At least **2 topics must be evergreen** (score ≥7)
- At least **1 topic must be a "series starter"** (Part 2 obvious)
- No duplicate formats in the batch

## Handoff
Each idea's payload goes straight to the kinetic pipeline — see the `zes-studio-video`
skill for the KineticVideo schema (`backgroundImage`, `camera`, `textLayers`,
`transitionOut`), and `zes-studio-image` for generating backgrounds.
