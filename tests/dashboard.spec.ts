import { test, expect } from '@playwright/test';

// Verifies the Load More functionality on the dashboard.
// Scenario:
// 1) Open dashboard at http://localhost:4567/
// 2) Initial items count should be 20
// 3) Click 'Load More' to load 20 more items (total 40)
// 4) Click again to load another 20 items (total 60)

test.describe('Dashboard Load More', () => {
  test('loads 20 -> 40 -> 60 items using Load More', async ({ page }) => {
    // 1. Open dashboard
    await page.goto('http://localhost:4567/');

    // 2. Initial item count should be 20
    const cards = page.locator('#memory-list > div.bg-white');
    await expect(cards).toHaveCount(20);

    // 3) Click 'Load More' to load next 20 items (total 40)
    const loadMoreBtn = page.locator('#load-more-btn');
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(40);

    // 4) Click again to load another 20 items (to 60)
    await loadMoreBtn.click();
    await expect(cards).toHaveCount(60);
  });
});
