function normalizeSearchText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeQuery(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ").filter(Boolean);
}

function buildSearchableText(prompt) {
  const usageContext = prompt.usage_context || {};
  const fields = [
    prompt.title || "",
    prompt.prompt_content || "",
    (prompt.tags || []).join(" "),
    usageContext.best_use_case || "",
    usageContext.recommended_model || "",
    usageContext.limitations || "",
  ];
  return normalizeSearchText(fields.join(" "));
}

self.onmessage = function (e) {
  const { query, prompts, searchId } = e.data;
  const tokens = tokenizeQuery(query);

  if (tokens.length === 0) {
    self.postMessage({ searchId, results: prompts });
    return;
  }

  const results = prompts.filter((prompt) => {
    const searchable = buildSearchableText(prompt);
    return tokens.every((token) => searchable.includes(token));
  });

  self.postMessage({ searchId, results });
};
