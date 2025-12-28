import dotenv from "dotenv";

dotenv.config();

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("No API key provided");
    process.exit(1);
  }

  console.log("Checking available models...");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
        console.error("API Error:", data.error);
        return;
    }

    if (data.models) {
        console.log("✅ Available models:");
        data.models.forEach((m: any) => {
            // generateContent를 지원하는 모델만 강조 표시
            if (m.supportedGenerationMethods.includes("generateContent")) {
                 console.log(`- ${m.name} [GENERATION SUPPORTED]`);
            } else {
                 console.log(`- ${m.name}`);
            }
        });
    } else {
        console.error("No models found:", data);
    }
  } catch (error) {
    console.error("Fetch Error:", error);
  }
}

main();