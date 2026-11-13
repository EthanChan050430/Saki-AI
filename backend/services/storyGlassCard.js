function createStoryGlassCard(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Story Glass card must be a JSON object.');
    }
    for (const key of ['cocktailName', 'storySummary', 'flavorDescription', 'sakiComment']) {
        if (typeof data[key] !== 'string' || !data[key].trim()) {
            throw new Error(`Story Glass requires ${key}.`);
        }
    }
    if (!Array.isArray(data.recipeList) || !data.recipeList.length || data.recipeList.some(item => typeof item !== 'string' || !item.trim())) {
        throw new Error('Story Glass requires a non-empty recipeList of ingredient strings with amounts.');
    }
    const card = {};
    for (const key of ['cocktailName', 'cocktailNameEn', 'cocktailSubtitle', 'storySummary', 'featuredQuote', 'flavorDescription', 'sakiComment', 'glassware', 'garnish', 'servingMoment', 'request']) {
        if (typeof data[key] === 'string') card[key] = data[key].trim();
    }
    for (const key of ['recipeList', 'storyTags', 'tastingNotes', 'pairingSuggestions']) {
        card[key] = Array.isArray(data[key]) ? data[key].filter(item => typeof item === 'string' && item.trim()) : [];
    }
    card.recipeMode = ['night-bar', 'comfort-home', 'zero-proof'].includes(data.recipeMode) ? data.recipeMode : 'comfort-home';
    card.language = data.language === 'zh' ? 'zh' : 'en';
    return { ...card, presentation: 'agent', status: 'completed', progress: 100, currentStage: 'completed' };
}

module.exports = { createStoryGlassCard };
