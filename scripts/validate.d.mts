/**
 * scripts/validate.mjs 的类型声明（纯 ESM 零依赖，Actions 与前端共用同一实现）
 */
import type { LotteryConfig } from '../src/config/lotteries'

export declare function validateDraw(
  config: LotteryConfig,
  draw: unknown,
): { ok: boolean; errors: string[] }

export declare function dedupeAndSort<T extends { drawNo: string }>(draws: T[]): T[]

export declare function checkContinuity(draws: { drawNo: string }[]): string[]

export declare function parseCsvRow(
  config: LotteryConfig,
  fields: string[],
): { drawNo: string; date: string; zones: number[][] }
