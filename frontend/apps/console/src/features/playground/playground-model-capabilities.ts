import type { PlaygroundMode, PlaygroundModel } from "@/data/contracts";

export function getPlaygroundModelModes(model: PlaygroundModel): PlaygroundMode[] {
  const endpointTypes = model.supportedEndpointTypes;
  if (!endpointTypes?.length) return ["chat"];

  const modes: PlaygroundMode[] = [];
  if (endpointTypes.includes("openai")) modes.push("chat");
  if (endpointTypes.includes("image-generation")) modes.push("image");
  if (endpointTypes.includes("openai-video")) modes.push("video");
  return modes;
}
