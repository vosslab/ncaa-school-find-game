/**
 * Central re-export hub for all generated typed game data.
 * Other modules import from this file rather than reaching into src/data/
 * directly, keeping import paths short and the data source easy to swap.
 *
 * Values are runtime constants (not type-only), so plain export re-exports
 * satisfy verbatimModuleSyntax without the `export type` form.
 */

export { NCAA_SCHOOLS, DIFFICULTY_TIERS, SUBREGIONS } from "./data/schools_data";
export { US_STATE_PATHS } from "./data/map_paths_data";
