import { Module } from '@nestjs/common'
import { EmbeddingAdapter } from './embedding.service'

@Module({ providers: [EmbeddingAdapter], exports: [EmbeddingAdapter] })
export class EmbeddingModule {}
