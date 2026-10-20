import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createEmbeddingEncoder } from './embedding.adapter'

@Injectable()
export class EmbeddingAdapter {
  private readonly encode: ReturnType<typeof createEmbeddingEncoder>

  constructor(config: ConfigService) {
    this.encode = createEmbeddingEncoder({
      provider: config.get<'local' | 'mock'>('EMBEDDING_PROVIDER', 'local'),
      model: config.get<string>('EMBEDDING_MODEL', 'Xenova/bge-small-en-v1.5'),
      revision: config.get<string>('EMBEDDING_MODEL_REVISION', 'main'),
      dimensions: config.get<number>('EMBEDDING_DIMENSIONS', 384),
      cacheEnabled: config.get<boolean>('EMBEDDING_CACHE_ENABLED', true),
      vectorCacheDir: config.get<string>('EMBEDDING_CACHE_DIR', '.cache/embeddings'),
      modelCacheDir: config.get<string>('TRANSFORMERS_CACHE_DIR', '.cache/transformers'),
    })
  }

  embedQuery(text: string) { return this.encode('query', text) }
  embedDocument(text: string) { return this.encode('document', text) }
}
