// The clone's identity and the worker's command router.
// systemPrompt turns the user's profile into the clone's instructions; routerPrompt asks
// the brain which real action a command maps to (same model as the prototype app).

export function systemPrompt(profile) {
  const prof = profile.profession || "professional";
  let s = `You are a digital clone of a ${prof}`;
  if (profile.name) s += ` named ${profile.name}`;
  s += `. You think, decide and write exactly as this person would, for their business work only.\n`;
  if (profile.style) s += `\nTheir working style: ${profile.style}\n`;
  if (Array.isArray(profile.rules) && profile.rules.length) {
    s += `\nRules you must always follow:\n` + profile.rules.map((r) => `- ${r}`).join("\n") + "\n";
  }
  s += `\nStay in this one profession. Be concise and practical. Never claim to be a real human to third parties.`;
  return s;
}

// Which real actions the clone worker can take today, and the clearly-declined ones.
export function routerPrompt(profile, command) {
  const prof = profile.profession || "professional";
  return `You are the command router for a ${prof}'s AI clone in the Arrow platform.
The user's command: "${command}".
Choose the ONE action and return JSON only.

Actions the platform CAN do now:
- answer: answer a work question in the user's style. field: topic.
- draft: write a message/post/plan in the user's style. field: topic.
- write_code: write code, a script, or a small app/website in the user's language and style, to review and run (and optionally open as a GitHub pull request). field: topic.
- make_content: create a short-form video/post (hook, script, caption) in the user's style, to review and post. field: topic.

Actions the platform CANNOT do yet (pick the closest if needed):
- needs_connection: a real task on an outside platform (post to Instagram/TikTok/YouTube, send an email) that needs that account connected first. field: topic names the platform.
- out_of_scope: a real task, but outside this profession.
- spend_money: buying, paying, deploying, moving money, or anything with irreversible real-world cost.

Return JSON: {"action": one of the above, "topic": "", "reply": "one short sentence to the user about what you are doing or why you can't yet"}.`;
}

export function askFor(action, profile, topic, command) {
  const prof = profile.profession || "professional";
  const about = topic || command;
  if (action === "write_code")
    return `You are a ${prof}. Write the code the user asked for: ${about}. Match their language and style. Put the code in a fenced code block, keep it complete and runnable, and add a short note on how to run it.`;
  if (action === "make_content")
    return `You are a ${prof}. In the user's own voice, create a short-form video or post about: ${about}. Give a scroll-stopping hook, a 30–45s script, and 2 caption options with hashtags.`;
  if (action === "draft") return `Draft this in the user's style: ${about}`;
  return about;
}
