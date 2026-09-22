# @aicss/react

Free AICSS React components. CSS modules included. No Tailwind peer dependency.

```bash
npm install @aicss/react
```

```tsx
import { ThinkingState } from "@aicss/react/thinking-state";
import { Orb } from "@aicss/react/orbs";
import { ImageReveal } from "@aicss/react/image-reveal";
```

```tsx
import { ImageReveal } from "@aicss/react/image-reveal";

// After the model returns an image URL. Default variant is `particles`.
<ImageReveal src={imageUrl} alt="Sunset over a glass pavilion" />

// Three finishes for the same still:
<ImageReveal src={imageUrl} variant="particles" />
<ImageReveal src={imageUrl} variant="bloom" />
<ImageReveal src={imageUrl} variant="spectrum" />

// Generating field until `src` arrives, then the chosen reveal.
<ImageReveal src={imageUrl} variant="bloom" label="Generating image" />

// Skip the short dot prelude if Image Processing already ran.
<ImageReveal src={imageUrl} variant="spectrum" prelude={false} />
```

`particles` grows the generating dots into circular samples of the photo.
`bloom` develops the still out of a luminous blur.
`spectrum` splits the image into RGB plates and snaps them into register.

In Next.js add `transpilePackages: ["@aicss/react"]`.

Docs: [https://www.aicss.dev](https://www.aicss.dev)
