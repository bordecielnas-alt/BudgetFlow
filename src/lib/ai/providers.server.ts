// Appels aux fournisseurs d'IA, uniquement côté serveur (les clés ne quittent jamais le serveur).
import Anthropic from "@anthropic-ai/sdk";

import type { AiProvider } from "@/lib/budget-types";
import { EXTRACTION_SCHEMA, type RawExtraction } from "./extraction";

export type ExtractionRequest = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  fileName: string;
  mimeType: string;
  base64: string;
  system: string;
  user: string;
};

export const SUPPORTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export type TokenCount = { input_tokens: number; output_tokens: number };

export async function extractStatement(
  request: ExtractionRequest,
): Promise<{ raw: RawExtraction; tokens: TokenCount | null }> {
  if (!request.apiKey) {
    throw new Error("Aucune clé API configurée pour ce fournisseur (Réglages → IA).");
  }
  if (!SUPPORTED_MIME_TYPES.includes(request.mimeType)) {
    throw new Error(
      `Format non pris en charge : ${request.mimeType || "inconnu"} (PDF, JPEG, PNG ou WebP).`,
    );
  }
  const { text, tokens } =
    request.provider === "anthropic"
      ? await callAnthropic(request)
      : request.provider === "openai"
        ? await callOpenAi(request)
        : await callGemini(request);
  return { raw: parseExtraction(text), tokens };
}

type CallResult = { text: string; tokens: TokenCount | null };

/** Vérifie la clé et l'existence du modèle via l'API des modèles (aucun coût). */
export async function checkProvider(
  provider: AiProvider,
  model: string,
  apiKey: string,
): Promise<string> {
  if (!apiKey) throw new Error("Aucune clé API configurée pour ce fournisseur.");
  if (provider === "anthropic") {
    try {
      const info = await new Anthropic({ apiKey }).models.retrieve(model);
      return info.display_name;
    } catch (error) {
      throw new Error(describeAnthropicError(error));
    }
  }
  if (provider === "openai") {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(await httpError("OpenAI", response));
    return model;
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel(model))}`,
    { headers: { "x-goog-api-key": apiKey } },
  );
  if (!response.ok) throw new Error(await httpError("Gemini", response));
  const info = (await response.json()) as { displayName?: string };
  return info.displayName ?? model;
}

// --- Claude (SDK officiel) ---------------------------------------------------

// Modèles qui acceptent le réglage d'effort et le repli automatique en cas de refus.
const CLAUDE_CURRENT = [
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
];

async function callAnthropic(request: ExtractionRequest): Promise<CallResult> {
  const client = new Anthropic({ apiKey: request.apiKey });
  const current = CLAUDE_CURRENT.includes(request.model);
  const source =
    request.mimeType === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: request.base64 },
        } as const)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: request.mimeType as "image/jpeg" | "image/png" | "image/webp",
            data: request.base64,
          },
        } as const);

  try {
    // Streaming : un relevé de plusieurs mois peut produire une longue réponse.
    const stream = client.beta.messages.stream({
      model: request.model,
      max_tokens: 64000,
      ...(current
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      output_config: {
        ...(current ? { effort: "medium" as const } : {}),
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      system: request.system,
      messages: [{ role: "user", content: [source, { type: "text", text: request.user }] }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new Error("Claude a refusé d'analyser ce document.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new Error(
        "Réponse tronquée : le document est trop long, découpez-le en plusieurs fichiers.",
      );
    }
    const { usage } = message;
    return {
      text: message.content.map((block) => (block.type === "text" ? block.text : "")).join(""),
      tokens: {
        input_tokens:
          usage.input_tokens +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0),
        output_tokens: usage.output_tokens,
      },
    };
  } catch (error) {
    throw new Error(describeAnthropicError(error));
  }
}

function describeAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "Clé API Anthropic invalide.";
  if (error instanceof Anthropic.NotFoundError) return "Modèle Claude introuvable.";
  if (error instanceof Anthropic.RateLimitError)
    return "Limite de débit Anthropic atteinte, réessayez dans un instant.";
  if (error instanceof Anthropic.APIError)
    return `Erreur Anthropic ${error.status ?? ""} : ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError)
    return "Impossible de joindre l'API Anthropic.";
  return (error as Error).message;
}

// --- Gemini (REST) -----------------------------------------------------------

function geminiModel(model: string): string {
  return model.replace(/^models\//, "");
}

/** Convertit le schéma JSON strict vers le sous-ensemble OpenAPI attendu par Gemini. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema) || schema === null || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    if (key === "type") {
      const types = Array.isArray(value) ? value : [value];
      const real = types.find((type) => type !== "null") as string;
      out["type"] = real.toUpperCase();
      if (types.includes("null")) out["nullable"] = true;
    } else if (key === "properties") {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, sub]) => [
          name,
          toGeminiSchema(sub),
        ]),
      );
    } else {
      out[key] = toGeminiSchema(value);
    }
  }
  return out;
}

async function callGemini(request: ExtractionRequest): Promise<CallResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel(request.model))}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": request.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: request.mimeType, data: request.base64 } },
              { text: request.user },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(EXTRACTION_SCHEMA),
          temperature: 0,
          maxOutputTokens: 65536,
        },
      }),
    },
  );
  if (!response.ok) throw new Error(await httpError("Gemini", response));

  const data = (await response.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini a bloqué la requête (${data.promptFeedback.blockReason}).`);
  }
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error(
      "Réponse tronquée : le document est trop long, découpez-le en plusieurs fichiers.",
    );
  }
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text)
    throw new Error(
      `Gemini n'a renvoyé aucun contenu (${candidate?.finishReason ?? "raison inconnue"}).`,
    );
  const usage = data.usageMetadata;
  return {
    text,
    tokens: usage
      ? {
          input_tokens: usage.promptTokenCount ?? 0,
          // La réflexion est facturée au tarif de sortie.
          output_tokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
        }
      : null,
  };
}

// --- OpenAI (REST, API Responses) --------------------------------------------

async function callOpenAi(request: ExtractionRequest): Promise<CallResult> {
  const dataUrl = `data:${request.mimeType};base64,${request.base64}`;
  const file =
    request.mimeType === "application/pdf"
      ? { type: "input_file", filename: request.fileName, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${request.apiKey}` },
    body: JSON.stringify({
      model: request.model,
      instructions: request.system,
      input: [{ role: "user", content: [file, { type: "input_text", text: request.user }] }],
      text: {
        format: {
          type: "json_schema",
          name: "releve_bancaire",
          schema: EXTRACTION_SCHEMA,
          strict: true,
        },
      },
    }),
  });
  if (!response.ok) throw new Error(await httpError("OpenAI", response));

  const data = (await response.json()) as {
    status?: string;
    incomplete_details?: { reason?: string };
    output?: Array<{
      type: string;
      content?: Array<{ type: string; text?: string; refusal?: string }>;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (data.status === "incomplete") {
    throw new Error(
      `Réponse OpenAI incomplète (${data.incomplete_details?.reason ?? "raison inconnue"}).`,
    );
  }
  const parts = (data.output ?? []).flatMap((item) =>
    item.type === "message" ? (item.content ?? []) : [],
  );
  const refusal = parts.find((part) => part.type === "refusal");
  if (refusal) throw new Error(`OpenAI a refusé d'analyser ce document : ${refusal.refusal ?? ""}`);
  return {
    text: parts.map((part) => (part.type === "output_text" ? (part.text ?? "") : "")).join(""),
    tokens: data.usage
      ? {
          input_tokens: data.usage.input_tokens ?? 0,
          output_tokens: data.usage.output_tokens ?? 0,
        }
      : null,
  };
}

// --- Commun ------------------------------------------------------------------

async function httpError(label: string, response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    // corps non JSON : on garde l'extrait brut
  }
  if (response.status === 401 || response.status === 403)
    return `Clé API ${label} refusée : ${detail}`;
  if (response.status === 404) return `Modèle ${label} introuvable : ${detail}`;
  return `${label} a répondu ${response.status} : ${detail}`;
}

function parseExtraction(text: string): RawExtraction {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");
  let parsed: Partial<RawExtraction>;
  try {
    parsed = JSON.parse(cleaned) as Partial<RawExtraction>;
  } catch {
    throw new Error("Réponse de l'IA illisible (JSON invalide). Relancez l'analyse.");
  }
  return {
    statement: {
      bank: parsed.statement?.bank ?? null,
      period_start: parsed.statement?.period_start ?? null,
      period_end: parsed.statement?.period_end ?? null,
      opening_balance: parsed.statement?.opening_balance ?? null,
      closing_balance: parsed.statement?.closing_balance ?? null,
      total_debit: parsed.statement?.total_debit ?? null,
      total_credit: parsed.statement?.total_credit ?? null,
    },
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
  };
}
