/**
 * A tiny, dependency-free glob matcher for scoping capabilities by changed
 * files (Factory automated-qa's `path_patterns`). Proofkeeper bundles no glob
 * library; this covers the patterns a path map needs:
 *
 *  - `*`  matches within a path segment (any run of non-`/` characters)
 *  - `**` matches across segments (any characters, including `/`)
 *  - `**​/` matches zero or more leading directories
 *  - `?`  matches a single non-`/` character
 *
 * Everything else is matched literally. Patterns are anchored to the full path.
 */

const REGEX_SPECIAL = new Set("\\^$.|+()[]{}".split(""));

/** Compile a glob to an anchored RegExp. Pure and deterministic. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++; // consume the second '*'
        if (glob[i + 1] === "/") {
          i++; // consume the '/'
          re += "(?:.*/)?"; // '**/' → zero or more directories
        } else {
          re += ".*"; // '**' → anything, across separators
        }
      } else {
        re += "[^/]*"; // '*' → within a segment
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (REGEX_SPECIAL.has(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/** True when `path` matches any of the globs. */
export function matchesAnyGlob(path: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}
