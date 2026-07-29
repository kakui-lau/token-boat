/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
export const priceComponentLabels: Record<string, string> = {
  input_unit_price: 'Input / 1M tokens',
  output_unit_price: 'Output / 1M tokens',
  cache_read_unit_price: 'Cache Read / 1M tokens',
  cache_write_unit_price: 'Cache Write / 1M tokens',
  image_input_unit_price: 'Image Input / 1M tokens',
  image_output_unit_price: 'Image Output / 1M tokens',
  audio_input_unit_price: 'Audio Input / 1M tokens',
  audio_output_unit_price: 'Audio Output / 1M tokens',
  request_unit_price: 'Per Request',
  video_second_unit_price: 'Per Video Second',
  token_input: 'Token input',
  token_output: 'Token output',
  cache_read: 'Cache read',
  cache_write: 'Cache write',
  image_input: 'Image input',
  image_output: 'Image output',
  audio_input: 'Audio input',
  audio_output: 'Audio output',
  request: 'Request',
  image: 'Image',
  audio_second: 'Audio second',
  video_second: 'Video second',
  character: 'Character',
}

export type PriceRule = {
  id?: string
  name?: string
  component?: string
  unit?: string
  unit_size?: string
  unit_price?: string
  upper_bound?: string
  operation?: string
  quality?: string
  resolution?: string
  with_audio?: string
}

export function readPriceComponents(raw?: string): Record<string, unknown> {
  if (!raw) {
    return {}
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}
