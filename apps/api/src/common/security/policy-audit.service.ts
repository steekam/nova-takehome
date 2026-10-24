import { Injectable, type OnApplicationBootstrap } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import { POLICY_REQUIREMENTS_KEY, type PolicyRequirement } from '../auth/policy'

@Injectable()
export class PolicyAuditService implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const missing: string[] = []
    for (const { instance, metatype } of this.discovery.getControllers()) {
      if (!instance || !metatype) continue
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name]
        if (typeof handler !== 'function' || !Reflect.hasMetadata(PATH_METADATA, handler)) continue
        const requirements = this.reflector.getAllAndMerge<PolicyRequirement[]>(
          POLICY_REQUIREMENTS_KEY,
          [metatype, handler],
        )
        if (!requirements?.length) missing.push(`${metatype.name}.${name}`)
      }
    }
    if (missing.length)
      throw new Error(`Routes require explicit authorization: ${missing.join(', ')}`)
  }
}
