// RecipeSource interface (documentation only — no runtime code).
//
// loadPublic():  Promise<{ meta, avoidances, protocols, recipes }>
// loadPrivate(): Promise<{ notes, ratings, history, week }> | null   -- M6
// capabilities:  { write: boolean, private: boolean }
//
// Nothing outside js/data/ may call fetch(). Every consumer goes through
// whatever RecipeSource implementation js/app.js constructs.
