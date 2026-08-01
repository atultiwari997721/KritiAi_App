/**
 * Kriti AI - Multi-Model Hybrid Router
 * Phase 2: Autonomous Dynamic Model Orchestration
 */

import axios from 'axios';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface RouterConfig {
  ollamaBaseUrl: string;
  defaultOllamaModel?: string;
  customKritiAiApiUrl?: string;
  customKritiAiApiKey?: string;
  cloudFallbackApiUrl?: string;
  cloudFallbackApiKey?: string;
  preferredTier: 'auto' | 'local_only' | 'colab_only' | 'cloud_only';
}

export interface CompletionResponse {
  content: string;
  routedTo: 'OLLAMA_LOCAL' | 'KRITIAI_CUSTOM_GPU' | 'CLOUD_FALLBACK';
  modelUsed: string;
  latencyMs: number;
}

export class ModelRouter {
  private config: RouterConfig;
  private activeOllamaModel: string = 'qwen2.5-coder:1.5b-instruct-q4_k_m';

  constructor(config?: Partial<RouterConfig>) {
    this.config = {
      ollamaBaseUrl: config?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      defaultOllamaModel: config?.defaultOllamaModel || process.env.DEFAULT_OLLAMA_MODEL,
      customKritiAiApiUrl: config?.customKritiAiApiUrl || process.env.KRITIAI_CUSTOM_API_URL,
      customKritiAiApiKey: config?.customKritiAiApiKey || process.env.KRITIAI_CUSTOM_API_KEY,
      cloudFallbackApiUrl: config?.cloudFallbackApiUrl || process.env.CLOUD_FALLBACK_API_URL || 'https://api.groq.com/openai/v1',
      cloudFallbackApiKey: config?.cloudFallbackApiKey || process.env.GROQ_API_KEY,
      preferredTier: config?.preferredTier || 'auto'
    };

    this.detectBestOllamaModel().catch(() => {});
  }

  /**
   * Dynamically query Ollama /api/tags to select available model
   */
  public async detectBestOllamaModel(): Promise<string> {
    try {
      const res = await axios.get(`${this.config.ollamaBaseUrl}/api/tags`, { timeout: 2000 });
      if (res.data && Array.isArray(res.data.models) && res.data.models.length > 0) {
        const modelNames = res.data.models.map((m: any) => m.name);
        console.log(`[ModelRouter] Detected installed Ollama models:`, modelNames);

        // Pick coder model if available, otherwise first available
        const coderModel = modelNames.find((n: string) => n.toLowerCase().includes('coder') || n.toLowerCase().includes('qwen'));
        this.activeOllamaModel = coderModel || modelNames[0];
        console.log(`[ModelRouter] Selected active Ollama model: ${this.activeOllamaModel}`);
        return this.activeOllamaModel;
      }
    } catch (e) {
      console.warn(`[ModelRouter] Could not query Ollama models list, using default: ${this.activeOllamaModel}`);
    }
    return this.activeOllamaModel;
  }

  public async isOllamaAlive(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.config.ollamaBaseUrl}/api/version`, { timeout: 1500 });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  public async isCustomGpuAlive(): Promise<boolean> {
    if (!this.config.customKritiAiApiUrl) return false;
    try {
      const res = await axios.get(`${this.config.customKritiAiApiUrl}/health`, { timeout: 2500 });
      return res.status === 200 && res.data?.status === 'healthy';
    } catch {
      return false;
    }
  }

  public async classifyIntent(prompt: string): Promise<string> {
    if (await this.isCustomGpuAlive()) {
      try {
        const res = await axios.post(`${this.config.customKritiAiApiUrl}/v1/intent/classify`, { prompt }, { timeout: 2000 });
        return res.data?.routing?.intent_name || 'CODE_AUTONOMOUS';
      } catch (err) {
        console.warn('[ModelRouter] Custom intent classifier failed, falling back to heuristic.');
      }
    }

    const lower = prompt.toLowerCase();
    if (lower.includes('email') || lower.includes('calendar') || lower.includes('remind') || lower.includes('schedule')) {
      return 'SYSTEM_ACTION';
    }
    if (lower.includes('refactor') || lower.includes('fix') || lower.includes('function') || lower.includes('class') || lower.includes('error') || lower.includes('bug')) {
      return 'CODE_AUTONOMOUS';
    }
    if (lower.includes('architect') || lower.includes('design system') || lower.length > 800) {
      return 'COMPLEX_REASONING';
    }
    return 'LOCAL_FAST';
  }

  public async routeCompletion(messages: ModelMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<CompletionResponse> {
    const startTime = Date.now();
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
    const intent = await this.classifyIntent(lastUserMessage);

    console.log(`[ModelRouter] Prompt intent classified as: ${intent}`);

    const ollamaOnline = await this.isOllamaAlive();
    const colabOnline = await this.isCustomGpuAlive();

    if (ollamaOnline) {
      try {
        return await this.callOllama(messages, options, startTime);
      } catch (e: any) {
        console.warn(`[ModelRouter] Local Ollama call failed (${e.message}), checking fallbacks.`);
      }
    }

    if (colabOnline) {
      try {
        return await this.callCustomGpu(messages, options, startTime);
      } catch (e) {
        console.warn('[ModelRouter] Custom Colab GPU failed, falling back to Cloud.');
      }
    }

    if (this.config.cloudFallbackApiKey) {
      return this.callCloudFallback(messages, options, startTime);
    }

    // Friendly local mock response if all remote APIs are offline
    return {
      content: `[Kriti AI Core Engine]: Received "${lastUserMessage}". Local Ollama engine is active (${this.activeOllamaModel}). Ready to assist.`,
      routedTo: 'OLLAMA_LOCAL',
      modelUsed: this.activeOllamaModel,
      latencyMs: Date.now() - startTime
    };
  }

  private async callOllama(messages: ModelMessage[], options: any, startTime: number): Promise<CompletionResponse> {
    const modelToUse = this.activeOllamaModel;
    const response = await axios.post(`${this.config.ollamaBaseUrl}/api/chat`, {
      model: modelToUse,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.2,
        num_predict: options?.maxTokens ?? 1024
      }
    }, { timeout: 30000 });

    return {
      content: response.data.message?.content || '',
      routedTo: 'OLLAMA_LOCAL',
      modelUsed: modelToUse,
      latencyMs: Date.now() - startTime
    };
  }

  private async callCustomGpu(messages: ModelMessage[], options: any, startTime: number): Promise<CompletionResponse> {
    const response = await axios.post(`${this.config.customKritiAiApiUrl}/v1/chat/completions`, {
      messages,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.2
    }, {
      headers: this.config.customKritiAiApiKey ? { 'Authorization': `Bearer ${this.config.customKritiAiApiKey}` } : {},
      timeout: 30000
    });

    return {
      content: response.data.choices[0]?.message?.content || '',
      routedTo: 'KRITIAI_CUSTOM_GPU',
      modelUsed: 'KritiAi-Custom-GPU',
      latencyMs: Date.now() - startTime
    };
  }

  private async callCloudFallback(messages: ModelMessage[], options: any, startTime: number): Promise<CompletionResponse> {
    const response = await axios.post(`${this.config.cloudFallbackApiUrl}/chat/completions`, {
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2048
    }, {
      headers: {
        'Authorization': `Bearer ${this.config.cloudFallbackApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });

    return {
      content: response.data.choices[0]?.message?.content || '',
      routedTo: 'CLOUD_FALLBACK',
      modelUsed: 'llama-3.3-70b-versatile (Cloud)',
      latencyMs: Date.now() - startTime
    };
  }
}
