import { create } from 'zustand';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';
import type { WriterDocType, WriterTone, WriterLength, AIWriterDoc, WriterGenerateResponse } from '@/types';

// System prompts for browser-native generation (same as backend WriterController)
const SYSTEM_PROMPTS: Record<string, string> = {
  blog: "You are an expert content writer. Write a well-structured blog post about the given topic.\n\nRules:\n- Use markdown with H2 headings\n- Include an engaging introduction and conclusion\n- SEO-friendly: use the topic keywords naturally\n- Include actionable insights\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput ONLY the article content in markdown. No meta commentary.",
  script: "You are a professional video scriptwriter. Write a video script about the given topic.\n\nRules:\n- Start with a hook (first 3 seconds)\n- Clear sections: Hook, Introduction, Main Points, Conclusion, CTA\n- Write in spoken language (contractions, conversational)\n- Include visual cues in [brackets] where relevant\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput ONLY the script. No meta commentary.",
  email: "You are an email copywriting expert. Write a marketing/newsletter email about the given topic.\n\nRules:\n- Subject line (max 60 chars)\n- Preview text (max 90 chars)\n- Engaging body with clear sections\n- One primary CTA\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput the subject line, preview, and body clearly labeled.",
  social: "You are a social media strategist. Write social media posts about the given topic.\n\nRules:\n- Create posts for: Twitter/X (max 280 chars), Instagram (caption + 5 hashtags), LinkedIn (professional), TikTok (casual hook + script)\n- Each post optimized for its platform\n- Include relevant emojis\n- Tone: {tone}\n\nOutput all 4 posts clearly labeled by platform.",
  description: "You are a copywriter specializing in product and video descriptions. Write a compelling description about the given topic.\n\nRules:\n- Lead with the primary benefit\n- Use bullet points for features\n- Include relevant keywords for discoverability\n- End with a call to action\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput ONLY the description. No meta commentary.",
  ad: "You are an advertising copywriter. Write persuasive ad copy about the given topic.\n\nRules:\n- Create 3 variants (Variant A, B, C)\n- Each variant: Headline (max 30 chars) + Body (max 90 chars) + CTA (max 15 chars)\n- Use power words and urgency\n- Focus on benefits, not features\n- Tone: {tone}\n\nOutput all 3 variants clearly labeled. No meta commentary.",
};

const LENGTH_GUIDE: Record<string, string> = {
  short: '~200 words',
  medium: '~500 words',
  long: '~1000 words',
};

/** Template-based content generation — final fallback when both API and browser AI are unavailable. */
function generateFromTemplate(docType: string, topic: string, tone: string, length: string): string {
  const topicClean = topic.trim();
  const lengthWord = length === 'short' ? 'concise' : length === 'long' ? 'comprehensive' : 'detailed';
  const toneAdj = tone === 'casual' ? 'friendly and approachable' : tone === 'persuasive' ? 'compelling and action-oriented' : tone === 'informative' ? 'clear and educational' : 'professional and polished';

  switch (docType) {
    case 'blog':
      return `# ${topicClean}: A ${lengthWord.charAt(0).toUpperCase() + lengthWord.slice(1)} Guide

In today's rapidly evolving landscape, understanding **${topicClean}** has become more important than ever. Whether you're a seasoned professional or just getting started, this ${toneAdj} guide will walk you through the essential concepts and actionable strategies you need to know.

## Why ${topicClean} Matters

The significance of ${topicClean} cannot be overstated. Industry leaders consistently point to it as a critical factor in achieving sustainable growth and staying competitive. By investing time in understanding this topic, you position yourself ahead of the curve.

## Key Strategies for Success

### 1. Start With a Solid Foundation
Before diving into advanced techniques, make sure you have a clear understanding of the fundamentals. This means researching best practices, identifying key stakeholders, and setting measurable goals.

### 2. Leverage Data-Driven Insights
Use analytics and performance metrics to inform your decisions. The most successful approaches to ${topicClean} are those backed by real data and continuous iteration.

### 3. Stay Consistent and Adapt
Consistency is the backbone of any successful initiative. Set a schedule, track your progress, and be willing to pivot when the data tells you to.

## Common Pitfalls to Avoid

- **Skipping research:** Jumping in without understanding the landscape leads to wasted effort
- **Ignoring feedback:** Your audience and stakeholders provide invaluable direction
- **Overcomplicating things:** Start simple, measure results, then optimize

## Putting It All Together

Success with ${topicClean} requires a combination of strategic thinking, consistent execution, and a willingness to learn from both successes and setbacks. Start with the fundamentals, track your metrics, and iterate based on what works.

**Your next step:** Pick one strategy from this guide and implement it this week. Small, consistent actions lead to significant results over time.`;

    case 'script':
      return `[HOOK - First 3 seconds]
"What if I told you there's a better way to approach ${topicClean}? Stay with me."

[INTRO]
Hey everyone! Today we're diving deep into ${topicClean} -- and trust me, by the end of this video, you'll have a completely new perspective on how to make it work for you.

[MAIN POINT 1 - The Problem]
Here's what most people get wrong about ${topicClean}. They think it's just about doing more of the same thing. But the truth is, it's about working smarter, not harder.

[B-ROLL: Show examples/statistics]

[MAIN POINT 2 - The Solution]
The approach I'm going to share with you has been tested and proven. It comes down to three simple steps:

Step one -- understand your starting point.
Step two -- set clear, measurable goals.
Step three -- execute consistently and track your progress.

[MAIN POINT 3 - Results]
When you follow this framework, here's what happens. You stop guessing and start seeing real, tangible results. And the best part? It works whether you're just starting out or you've been at this for years.

[CONCLUSION]
So there you have it -- everything you need to know about ${topicClean} to start seeing results today. Remember, the key is to take action, not just watch videos about it.

[CTA]
If this was helpful, smash that like button and subscribe for more content like this. Drop a comment below telling me your biggest takeaway. See you in the next one!`;

    case 'email':
      return `**Subject Line:** Unlock the Power of ${topicClean} Today

**Preview Text:** Discover proven strategies that deliver real results...

---

Hi there,

I wanted to share something exciting with you today.

Over the past few months, we've been studying what makes ${topicClean} truly effective -- and the results have been eye-opening.

**Here's what we found:**

The most successful approaches share three things in common:
1. **Clear objectives** -- knowing exactly what you want to achieve
2. **Consistent execution** -- showing up and doing the work every day
3. **Smart iteration** -- using data to improve over time

We've put together a ${lengthWord} resource that breaks down each of these principles with practical, actionable steps you can start using right away.

**What you'll learn:**
- The #1 mistake people make with ${topicClean} (and how to avoid it)
- A simple framework for getting started in under 30 minutes
- Real examples from people who've seen incredible results

[Access the Full Guide Now]

This ${toneAdj} guide is available for a limited time, so don't miss out.

Best,
The Contentine Create Team

P.S. Have questions? Just reply to this email -- we read every response.`;

    case 'social':
      return `**Twitter/X (280 chars)**
${topicClean} doesn't have to be complicated. Here are 3 things I wish I knew sooner:

1. Start small
2. Stay consistent
3. Measure everything

What would you add? Drop your best tip below.

---

**Instagram Caption**
Ready to level up your approach to ${topicClean}? Here's the truth nobody talks about...

It's not about having the perfect strategy from day one. It's about starting, learning, and adapting as you go.

The people who succeed aren't the ones with the most resources -- they're the ones who take action consistently.

Save this post for when you need a reminder to keep going.

#${topicClean.replace(/\s+/g, '')} #ContentCreator #GrowthMindset #DigitalStrategy #ContentStrategy

---

**LinkedIn**
I've spent the last few months studying ${topicClean}, and here's my biggest takeaway:

The gap between knowing and doing is where most people get stuck.

We read articles. We watch videos. We attend workshops. But execution? That's where the magic happens.

Here's my 3-step framework for turning knowledge into action:

1. Pick ONE thing to focus on this week
2. Set a measurable goal (not "do more" but "do X by Friday")
3. Review and adjust on Sunday

Simple? Yes. Effective? Absolutely.

What's your approach to turning ideas into action? I'd love to hear in the comments.

---

**TikTok Script**
[Hook] "Stop overcomplicating ${topicClean}!"

Here's what actually works:

Step 1: Pick one goal. Just one.
Step 2: Work on it for 30 minutes a day.
Step 3: Track your progress every week.

That's literally it. The people who win aren't doing anything fancy -- they're just doing the basics consistently.

Follow for more tips like this!`;

    case 'description':
      return `**${topicClean} -- Everything You Need to Know**

Transform your approach to ${topicClean} with this ${lengthWord} and ${toneAdj} guide.

**Key Benefits:**
- Save time with proven frameworks and strategies
- Avoid common mistakes that hold most people back
- Get actionable steps you can implement immediately
- See measurable results within weeks, not months

**What's Included:**
- Step-by-step implementation guide
- Real-world examples and case studies
- Performance tracking templates
- Quick-reference cheat sheet

**Who This Is For:**
Whether you're a complete beginner or an experienced professional looking to refine your approach, this resource is designed to meet you where you are and help you level up.

**Why Choose This Approach:**
Unlike generic advice that sounds good but lacks substance, everything here is based on real data and proven results. No fluff, no filler -- just practical strategies that work.

Ready to get started? Take the first step today and see the difference for yourself.`;

    case 'ad':
      return `**Variant A**
Headline: Master ${topicClean.slice(0, 20)}
Body: Stop guessing, start growing. Our proven framework delivers real results in weeks, not months.
CTA: Get Started Free

---

**Variant B**
Headline: ${topicClean.slice(0, 20)} Made Simple
Body: Join thousands who transformed their approach. Data-driven strategies that actually work.
CTA: Try It Now

---

**Variant C**
Headline: Unlock ${topicClean.slice(0, 17)} Power
Body: The smart way to succeed. Expert-backed methods, zero guesswork. See results in 7 days.
CTA: Start Today`;

    default:
      return `# ${topicClean}\n\nA ${lengthWord} and ${toneAdj} exploration of ${topicClean}.\n\n## Overview\n\n${topicClean} is a topic that deserves careful attention and thoughtful analysis. This document provides a structured approach to understanding its key aspects and practical applications.\n\n## Key Points\n\n1. **Foundation:** Understanding the core principles behind ${topicClean}\n2. **Strategy:** Developing an actionable plan for implementation\n3. **Execution:** Putting your plan into practice with consistency\n4. **Measurement:** Tracking results and iterating for improvement\n\n## Conclusion\n\nBy following a systematic approach to ${topicClean}, you can achieve meaningful and measurable results. Start with the fundamentals, stay consistent, and let the data guide your decisions.`;
  }
}

interface WriterState {
  docType: WriterDocType;
  topic: string;
  tone: WriterTone;
  length: WriterLength;
  additionalInstructions: string;
  isGenerating: boolean;
  generatedTitle: string;
  generatedContent: string;
  wordCount: number;
  generateError: string | null;
  generationSource: 'backend' | 'browser' | null;
  modelProgress: { text: string; progress: number } | null;
  documents: AIWriterDoc[];
  isLoadingDocs: boolean;
  activeDoc: AIWriterDoc | null;

  setDocType: (type: WriterDocType) => void;
  setTopic: (topic: string) => void;
  setTone: (tone: WriterTone) => void;
  setLength: (length: WriterLength) => void;
  setAdditionalInstructions: (text: string) => void;
  generate: () => Promise<void>;
  fetchDocuments: () => Promise<void>;
  loadDocument: (id: number) => Promise<void>;
  deleteDocument: (id: number) => Promise<void>;
  setActiveDoc: (doc: AIWriterDoc | null) => void;
  resetForm: () => void;
  copyContent: () => void;
}

export const useWriterStore = create<WriterState>((set, get) => ({
  docType: 'blog',
  topic: '',
  tone: 'professional',
  length: 'medium',
  additionalInstructions: '',
  isGenerating: false,
  generatedTitle: '',
  generatedContent: '',
  wordCount: 0,
  generateError: null,
  generationSource: null,
  modelProgress: null,
  documents: [],
  isLoadingDocs: false,
  activeDoc: null,

  setDocType: (type) => set({ docType: type }),
  setTopic: (topic) => set({ topic }),
  setTone: (tone) => set({ tone }),
  setLength: (length) => set({ length }),
  setAdditionalInstructions: (text) => set({ additionalInstructions: text }),

  generate: async () => {
    const { docType, topic, tone, length, additionalInstructions } = get();
    if (!topic.trim()) return;

    set({ isGenerating: true, generateError: null, generatedContent: '', generatedTitle: '', modelProgress: null });

    // Step 1: Try backend API first (faster if configured)
    try {
      const res = await api.post<WriterGenerateResponse>('/writer/generate', {
        type: docType,
        topic: topic.trim(),
        tone,
        length,
        additional_instructions: additionalInstructions.trim() || undefined,
      });

      if (res?.content) {
        const wc = res.word_count || res.content.split(/\s+/).filter(Boolean).length;
        const doc: AIWriterDoc = {
          id: Date.now(),
          user_id: 0,
          title: res.title || topic.trim(),
          type: docType,
          content: res.content,
          created_at: new Date().toISOString(),
        };
        // Save generated doc to localDB
        await localDB.put('writer_documents', doc).catch(() => {});
        set({
          generatedTitle: res.title || topic.trim(),
          generatedContent: res.content,
          wordCount: wc,
          isGenerating: false,
          generationSource: 'backend',
        });
        return;
      }
    } catch {
      // Backend not available — fall through to browser-native
    }

    // Step 2: Browser-native fallback using browserEngineManager (Gemini Nano or WebLLM)
    try {
      const { browserEngineManager } = await import('@/engine/browser-engine-manager');

      // Set progress callback for model download (applies to WebLLM path)
      browserEngineManager.setProgressCallback((progress) => {
        set({ modelProgress: progress });
      });

      let textEngine;
      try {
        textEngine = await browserEngineManager.getTextEngine();
      } catch {
        // No browser AI engine available — fall through to template fallback
        throw new Error('No browser AI engine');
      }

      // Build the prompt
      const systemTemplate = SYSTEM_PROMPTS[docType] || SYSTEM_PROMPTS.blog;
      const systemPrompt = systemTemplate
        .replace('{tone}', tone)
        .replace('{length_guide}', LENGTH_GUIDE[length] || LENGTH_GUIDE.medium);

      let userPrompt = `Topic: ${topic.trim()}`;
      if (additionalInstructions.trim()) {
        userPrompt += `\n\nAdditional instructions: ${additionalInstructions.trim()}`;
      }

      set({ modelProgress: { text: `Generating with ${textEngine.name}...`, progress: 1 } });

      // Stream the output
      let fullText = '';
      await textEngine.generateStream(systemPrompt, userPrompt, (chunk) => {
        fullText += chunk;
        set({
          generatedContent: fullText,
          wordCount: fullText.split(/\s+/).filter(Boolean).length,
        });
      });

      // Save generated doc to localDB
      const doc: AIWriterDoc = {
        id: Date.now(),
        user_id: 0,
        title: topic.trim(),
        type: docType,
        content: fullText,
        created_at: new Date().toISOString(),
      };
      await localDB.put('writer_documents', doc).catch(() => {});

      set({
        generatedTitle: topic.trim(),
        isGenerating: false,
        generationSource: 'browser',
        modelProgress: null,
      });
    } catch {
      // Step 2 failed — fall through to template-based fallback
    }

    // Step 3: Template-based fallback — generates structured content locally without any AI engine
    try {
      set({ modelProgress: { text: 'Generating with local templates...', progress: 0.5 } });

      const content = generateFromTemplate(docType, topic, tone, length);
      const wc = content.split(/\s+/).filter(Boolean).length;

      const doc: AIWriterDoc = {
        id: Date.now(),
        user_id: 0,
        title: topic.trim(),
        type: docType,
        content,
        created_at: new Date().toISOString(),
      };
      await localDB.put('writer_documents', doc).catch(() => {});

      set({
        generatedTitle: topic.trim(),
        generatedContent: content,
        wordCount: wc,
        isGenerating: false,
        generationSource: 'browser',
        modelProgress: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      set({ generateError: message, isGenerating: false, modelProgress: null });
    }
  },

  fetchDocuments: async () => {
    set({ isLoadingDocs: true });
    try {
      const res = await api.get<{ documents: AIWriterDoc[] }>('/writer/documents');
      const documents = res?.documents || [];
      set({ documents, isLoadingDocs: false });
      // Sync to local
      for (const d of documents) await localDB.put('writer_documents', d);
    } catch {
      // Fallback to localDB
      try {
        const documents = await localDB.getAll<AIWriterDoc>('writer_documents');
        set({ documents, isLoadingDocs: false });
      } catch {
        set({ documents: [], isLoadingDocs: false });
      }
    }
  },

  loadDocument: async (id) => {
    try {
      let doc: AIWriterDoc | null = null;

      try {
        doc = await api.get<AIWriterDoc>(`/writer/documents/${id}`);
        if (doc) {
          await localDB.put('writer_documents', doc).catch(() => {});
        }
      } catch {
        // Fallback to localDB
        doc = await localDB.get<AIWriterDoc>('writer_documents', id);
      }

      if (doc) {
        set({
          activeDoc: doc,
          docType: doc.type,
          generatedTitle: doc.title || '',
          generatedContent: doc.content || '',
          wordCount: (doc.content || '').split(/\s+/).filter(Boolean).length,
          topic: '',
        });
      }
    } catch {
      // Silently fail
    }
  },

  deleteDocument: async (id) => {
    await localDB.delete('writer_documents', id);
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
    // Sync to backend in background
    api.delete(`/writer/documents/${id}`).catch(() => {});
  },

  setActiveDoc: (doc) => set({ activeDoc: doc }),

  resetForm: () => set({
    topic: '',
    additionalInstructions: '',
    generatedTitle: '',
    generatedContent: '',
    wordCount: 0,
    generateError: null,
    activeDoc: null,
    modelProgress: null,
    generationSource: null,
  }),

  copyContent: () => {
    const { generatedContent } = get();
    if (generatedContent && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(generatedContent).catch(() => {});
    }
  },
}));
