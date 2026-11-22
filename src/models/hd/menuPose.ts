// High-detail menu models (lobby cards, hero picking): an expressive idle loop and a short cheer when picked.
export type MenuAnim = 'idle' | 'cheer'
export type MenuPose = { anim: MenuAnim; t: number } // t = seconds since this anim started (the caller advances it)
