/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Icon, IconProps } from "@phosphor-icons/react";
import { forwardRef } from "react";

const UNICORN_ICON_SRC = "/images/ai-unicorn.svg";

/**
 * The unicorn that marks AI features, in place of a sparkle. A drop-in for a Phosphor icon: it
 * renders an `<svg>` sized 1em (or `size`), so icon-sizing classes and `[&_svg]` selectors apply.
 * The drawing is in greys rather than `currentColor`, so it reads on light, dark and tinted
 * surfaces alike; `color` and `weight` are accepted and ignored.
 */
export const UnicornIcon: Icon = forwardRef<SVGSVGElement, IconProps>(function UnicornIcon(
  { alt, size = "1em", color: _color, weight: _weight, mirrored, children, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      width={size}
      height={size}
      transform={mirrored ? "scale(-1, 1)" : undefined}
      aria-hidden={alt ? undefined : true}
      role={alt ? "img" : undefined}
      {...props}
    >
      {alt ? <title>{alt}</title> : null}
      <image href={UNICORN_ICON_SRC} width="80" height="80" />
      {children}
    </svg>
  );
});
