# Chog Legacy — UI asset inventory

16 October 2026 · Milkwood Journal v2

| Asset | Location | Use/source |
| --- | --- | --- |
| Ashen woodland portrait | `public/art/ashen-storybook.png` | Original AI-generated artwork created for this redesign, supplied as a local static PNG. Landing hero and fictional practice character only. |
| Book mark and interface icons | `src/ui/Icon.tsx` | Original inline SVG shapes; decorative icons are hidden from assistive technology. |
| Actual Chog portrait | Real NFT metadata, existing `ipfsHttp` mapping | Keep the authentic metadata URL. The redesign adds no third-party character images. |
| Missing real portrait | `Portrait` component | Neutral book icon plus explicit image-unavailable copy. |
| Typefaces | System font stacks in CSS | No downloaded fonts or font services. |

Ashen is not an official Chog NFT image and must never substitute for unavailable real NFT metadata. The UI explicitly calls it fictional practice artwork. The original generated PNG is included unchanged, approximately 3.2 MB. No image-generation service is called at runtime.

Art direction: original charcoal-purple hedgehog-like fantasy creature, cream face, caramel scarf, satchel, lantern and map, warm woodland village, gouache/paper texture, cream/cocoa/sage/apricot colors, no logos or embedded text. Generated with OpenAI image generation for this handoff; do not claim collection ownership or an independent trademark clearance.

No further asset purchase is needed. Keep alt text useful and test image failure. If optimizing the image later, retain the supplied original and review the exported quality before replacing runtime references.
