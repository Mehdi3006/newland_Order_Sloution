import { GoogleGenAI, Type, GenerateContentResponse, GenerateContentParameters } from "@google/genai";
import { NewOrderData, Order, OrderItem, ChecklistTaskTemplate, AIProjectStructure, AISettings, CostingSettings, MainGroup, Category, SubCategory, Brand, AnalysisIssue, OrderItemAttribute, CategorizationResult, GeneratedSection, BrochureTranslationInput, BrochureTranslationOutput } from '../types';

/**
 * Parses a caught error from an AI API call and returns a user-friendly message.
 * @param error The error object caught.
 * @returns A string containing a user-friendly error message.
 */
// FIX: Defined an intermediate AIOrderItem type to hold temporary fields parsed from POs, resolving multiple type errors.
type AIOrderItem = Omit<OrderItem, 'id'> & {
    totalCartons?: number;
    totalCBM?: number;
    totalNetWeight?: number;
    totalGrossWeight?: number;
    unit?: string;
};

const getApiErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("api key not valid")) {
            return "The provided API Key is invalid or expired. Please check it in Settings > AI Settings.";
        }
        if (message.includes("quota") || message.includes("resource has been exhausted")) {
            return "You have exceeded your API quota for the model. Please check your Google AI account usage or try again later.";
        }
        if (message.includes("safety policy") || message.includes("blocked")) {
            return "The request was blocked due to safety policies. This can happen with sensitive or unsafe prompts. Please modify your input and try again.";
        }
        if (message.includes("rpc failed") || message.includes("xhr error") || message.includes("network error")) {
             return "A network error occurred while communicating with the AI service. Please check your internet connection and try again.";
        }
        return error.message;
    }
    return "An unknown error occurred during the AI operation.";
};

/**
 * Translates a given text to a target language using the Gemini API.
 * @param text The text to translate.
 * @param targetLang The target language (e.g., "Persian", "Arabic").
 * @param apiKey The Google GenAI API key.
 * @param model The model to use for translation.
 * @returns A promise that resolves to the translated string.
 */
export async function translateText(text: string, targetLang: string, apiKey: string, model: string): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = `You are an expert translator. Translate the provided text to the target language. Provide only the translated text as a raw string, with no extra formatting, labels, or explanations.`;
        const userContent = `Target Language: ${targetLang}\nText: "${text}"`;

        const response = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
            },
        });
        // Remove potential quotes from the response
        return response.text.trim().replace(/^"|"$/g, '');
    } catch (error) {
        console.error(`Error translating text to ${targetLang}:`, error);
        throw new Error(getApiErrorMessage(error));
    }
}


const attributeSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      key: {
        type: Type.STRING,
        description: 'The name of the attribute, feature, or specification (e.g., "Screen Size", "Processor", "Color").',
      },
      value: {
        type: Type.STRING,
        description: 'The value of the attribute (e.g., "55 inches", "Snapdragon 8 Gen 2", "Black").',
      },
    },
    required: ['key', 'value'],
  },
};

export async function parseAttributesFromText(text: string, model: string, apiKey: string): Promise<{key: string; value: string}[]> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = `You are an expert at parsing unstructured product specification text. Analyze the following text and extract all technical specifications, features, and attributes as key-value pairs. Ignore marketing language or sentences that don't contain concrete data. Provide the output as a JSON array of objects, where each object has a 'key' and a 'value' property.`;
        const userContent = `Text to parse:\n---\n${text}\n---`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: attributeSchema,
            },
        });
        
        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        if (Array.isArray(parsedJson)) {
            const isValid = parsedJson.every(item => 
                typeof item === 'object' &&
                item !== null &&
                'key' in item &&
                'value' in item &&
                typeof item.key === 'string' &&
                typeof item.value === 'string'
            );
            if (isValid) {
                return parsedJson as {key: string, value: string}[];
            }
        }
        
        console.error("AI response was not in the expected format:", parsedJson);
        throw new Error("AI response format is invalid.");

    } catch (error) {
        console.error("Error parsing attributes with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}

export async function parseAttributesFromImage(
    fileData: { mimeType: string; data: string },
    model: string,
    apiKey: string
): Promise<{ key: string; value: string }[]> {
    try {
        const ai = new GoogleGenAI({ apiKey });

        const imagePart = {
            inlineData: {
                mimeType: fileData.mimeType,
                data: fileData.data,
            },
        };

        const textPart = {
            text: `You are an expert at parsing product specifications from images. Analyze the following image, which might be of a product, its packaging, or a datasheet. Identify and extract all technical specifications, features, and attributes as key-value pairs. Focus on concrete data and ignore marketing slogans. Provide the output as a JSON array of objects, where each object has a 'key' and a 'value' property. If no clear attributes are found, return an empty array.`
        };

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model, // gemini-3.5-flash is multimodal
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: attributeSchema,
            },
        });
        
        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        if (Array.isArray(parsedJson)) {
            const isValid = parsedJson.every(item => 
                typeof item === 'object' &&
                item !== null &&
                'key' in item &&
                'value' in item &&
                typeof item.key === 'string' &&
                typeof item.value === 'string'
            );
            if (isValid) {
                return parsedJson as {key: string, value: string}[];
            }
        }
        
        console.error("AI response from image was not in the expected format:", parsedJson);
        throw new Error("AI response format is invalid.");

    } catch (error) {
        console.error("Error parsing attributes from image with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}


const poSchema = {
    type: Type.OBJECT,
    properties: {
        supplier: { type: Type.STRING, description: "The supplier, manufacturer, or company name." },
        internalCode: { type: Type.STRING, description: "The internal reference code or our PO number, if found. Can be null." },
        orderDate: { type: Type.STRING, description: "The date of the order or PI, in YYYY-MM-DD format." },
        approxLoadingDate: { type: Type.STRING, description: "The estimated loading, shipping, or delivery date, in YYYY-MM-DD format." },
        originPort: { type: Type.STRING, description: "The port of origin or loading. Can be null." },
        destinationPort: { type: Type.STRING, description: "The final destination port. Can be null." },
        purchaseType: { type: Type.STRING, description: "The type of purchase, can be 'cash' or 'credit'. If not specified, default to 'cash'." },
        currency: { type: Type.STRING, description: "The currency of the prices in the order (e.g., 'USD', 'CNY', 'AED', 'TOMAN'). Default to 'USD' if not explicitly mentioned." },
        orderTotals: {
            type: Type.OBJECT,
            description: "Extract any grand totals for the entire order found in a summary block (e.g., 'TOTAL: 200CARTONS, 15CBM'). Can be null if no summary block exists.",
            properties: {
                totalCartons: { type: Type.NUMBER, description: "The grand total number of cartons for the entire order." },
                totalCBM: { type: Type.NUMBER, description: "The grand total CBM for the entire order." },
                totalNetWeight: { type: Type.NUMBER, description: "The grand total Net Weight (N.W.) for the entire order." },
                totalGrossWeight: { type: Type.NUMBER, description: "The grand total Gross Weight (G.W.) for the entire order." }
            }
        },
        items: {
            type: Type.ARRAY,
            description: "List of all products or items in the order.",
            items: {
                type: Type.OBJECT,
                properties: {
                    internalCode: { type: Type.STRING, description: "The internal item code or SKU for the product (e.g., from 'ITEM NO.', 'Art.No.'). Can be null." },
                    supplierCode: { type: Type.STRING, description: "The supplier's own item code or model number for the product. Often in parentheses in the item number." },
                    productName: { type: Type.STRING, description: "The main name of the product in English (e.g., from 'DESCRIPTIONS'). Example: for 'DINNER SPOON/FORK', the name is 'DINNER SPOON/FORK'." },
                    productNameFa: { type: Type.STRING, description: "The main name of the product translated into Persian (Farsi). Can be null." },
                    quantity: { type: Type.NUMBER, description: "The total quantity of this product (e.g., from 'TOTAL QTY')." },
                    itemsPerCarton: { type: Type.NUMBER, description: "Number of units packed in one carton (e.g., from 'QTY/CTN' or text like '2pcs/carton')." },
                    totalCartons: { type: Type.NUMBER, description: "Total number of cartons for this line item (e.g., from 'CTN')." },
                    price: { type: Type.NUMBER, description: "The price per single unit (e.g., from 'UNIT PRICE')." },
                    cartonCBM: { type: Type.NUMBER, description: "The volume of ONE carton in cubic meters. Extract only if explicitly stated as per-carton CBM." },
                    totalCBM: { type: Type.NUMBER, description: "The TOTAL volume for the entire line item (e.g., from 'TOTAL CBM'). Prioritize this if available." },
                    hsCode: { type: Type.STRING, description: "The Harmonized System (HS) code. Can be null." },
                    netWeight: { type: Type.NUMBER, description: "The net weight of ONE carton in KG. Extract only if explicitly stated as per-carton N.W." },
                    grossWeight: { type: Type.NUMBER, description: "The gross weight of ONE carton in KG. Extract only if explicitly stated as per-carton G.W." },
                    totalNetWeight: { type: Type.NUMBER, description: "The TOTAL net weight for the entire line item in KG (e.g., from 'TOTAL N.W'). Prioritize this if available." },
                    totalGrossWeight: { type: Type.NUMBER, description: "The TOTAL gross weight for the entire line item in KG (e.g., from 'TOTAL G.W'). Prioritize this if available." },
                    unit: { type: Type.STRING, description: "The unit of the quantity, if specified (e.g., 'PCS', 'SETS', 'DOZ')." },
                    attributes: {
                        type: Type.ARRAY,
                        description: "List of all other technical specifications and features extracted from the description column.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                key: { type: Type.STRING, description: "The name of the attribute (e.g., 'Color', 'Voltage')." },
                                value: { type: Type.STRING, description: "The value of the attribute (e.g., 'Red', '220V')." }
                            },
                             required: ['key', 'value']
                        }
                    }
                },
                 required: ['productName', 'quantity', 'price']
            }
        },
        payments: {
            type: Type.ARRAY,
            description: "List of payments mentioned, like 'down payment', 'advance', or 'deposit'. Can be an empty array.",
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, description: "The type of payment. Use 'down_payment' for deposits or advances." },
                    amountUSD: { type: Type.NUMBER, description: "The amount of the payment in USD." },
                    date: { type: Type.STRING, description: "The date the payment was made or is due, in YYYY-MM-DD format. Can be null." }
                },
                required: ['type', 'amountUSD']
            }
        }
    }
};

export async function analyzePurchaseOrder(fileData: { mimeType: string; data: string }, model: string, apiKey: string): Promise<NewOrderData> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        
        let parts: any[];
        let additionalInstructions = "";

        if (fileData.mimeType.startsWith('text/plain')) {
            const combinedText = decodeURIComponent(escape(atob(fileData.data)));
            parts = [{ text: combinedText }];
            additionalInstructions = `
**CRITICAL INSTRUCTION for MULTI-SHEET DATA:** The provided text contains data from one or more spreadsheet sheets. An 'Invoice' sheet usually has pricing, and a 'Packing List' sheet has physical data (CBM, weight, pcs/carton). You MUST merge the data for each product. Match items across sheets using their model number. Extract all available data for each unique item from all sheets and combine it into a single item object in the output JSON.
            `;
        } else {
            parts = [{ inlineData: { mimeType: fileData.mimeType, data: fileData.data } }];
        }

        const textPart = {
            text: `You are an expert data extractor for logistics and purchasing. Your primary job is to extract numbers and text exactly as they appear in the document and place them into the correct fields of the provided JSON schema. **You must not perform any calculations unless explicitly instructed to.** The user's application will perform calculations after you extract the raw data.

**EXTRACTION STRATEGY:**
1.  **First Pass (Global Data):** Scan the entire document for a 'TOTAL' or 'SUMMARY' block, often at the bottom. If you find grand totals for the entire order (e.g., 'TOTAL: 200CARTONS, 15CBM'), extract these values into the optional \`orderTotals\` field in the JSON. Also extract top-level info like \`supplier\`, \`orderDate\`, etc.
2.  **Second Pass (Line Items):** For each distinct product row in the document's table, extract all available information for that specific item.

**CRITICAL INSTRUCTIONS for Line Item Fields:**
- **PRODUCT NAME (\`productName\`):** Extract ONLY the main title from the "DESCRIPTIONS" or similar column. For example, for a description like "DINNER SPOON/FORK", the \`productName\` is "DINNER SPOON/FORK". ALL other details like voltage, plug type, motor, CE APPROVAL, etc., MUST be extracted into the \`attributes\` array, NOT included in the product name.
- **FARSI NAME (\`productNameFa\`):** You MUST translate the English \`productName\` into Persian (Farsi) and populate this field.
- **PRODUCT CODES (\`internalCode\`, \`supplierCode\`):** The primary code from columns named "ITEM NO.", "Art.No.", or "Model No." goes into \`internalCode\`. For example, for "NL-EL-DS/DF", the \`internalCode\` is "NL-EL-DS/DF". If a second code is present (e.g., in parentheses or a different column), put it in \`supplierCode\`.
- **QUANTITIES:**
    - \`quantity\` (TOTAL QTY): The total number of individual units.
    - \`itemsPerCarton\` (QTY/CTN): The number of units in ONE carton. Look for a 'QTY/CTN' column or text like 'X PCS/CTN'.
    - \`totalCartons\` (CTN): The total cartons for this line item. If not present but you have \`quantity\` and \`itemsPerCarton\`, you may calculate it as \`ceil(quantity / itemsPerCarton)\`.
- **UNITS (\`unit\`):** If a unit like 'DOZ', 'dozen', or 'SETS' is specified, extract it here. Do not multiply the quantity yourself.
- **WEIGHTS & VOLUME (per line item):** Prioritize extracting the TOTAL values for the line item if available.
    - \`totalNetWeight\` (TOTAL N.W), \`totalGrossWeight\` (TOTAL G.W), \`totalCBM\` (TOTAL CBM).
    - **Per-Carton Values:** Only extract \`netWeight\`, \`grossWeight\`, or \`cartonCBM\` if the document explicitly states the value is PER CARTON. DO NOT calculate per-item weights by dividing.

**ABSOLUTE ACCURACY AND STRICTNESS:**
- You MUST ONLY extract data that is explicitly present in the provided document.
- **DO NOT INVENT DATA.** Do not guess, hallucinate, or create information that is not written in the file. For example, if the document shows cutlery, you must not output data about fans or any other product.
- If a value is not in the document, return \`null\` for that field. Your function is extraction, not creation.

Analyze the provided document. Extract all details and format the output as a JSON object matching the provided schema.
${additionalInstructions}`,
        };
        
        parts.push(textPart);

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: { parts: parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: poSchema,
            },
        });

        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        const poCurrency = (parsedJson.currency || 'USD').toUpperCase();
        const currency = (['USD', 'CNY', 'AED', 'TOMAN'].includes(poCurrency) ? poCurrency : 'USD') as 'USD' | 'CNY' | 'AED' | 'TOMAN';

        let poItems: AIOrderItem[] = (parsedJson.items || []).map((item: any): AIOrderItem => {
            let quantity = Number(item.quantity) || 0;
            if (item.unit?.toLowerCase().includes('doz')) {
                quantity *= 12;
            }
            
            return {
                internalCode: item.internalCode || '',
                supplierCode: item.supplierCode || '',
                productName: item.productName || '',
                productNameFa: item.productNameFa || '',
                quantity: quantity,
                price: Number(item.price) || 0,
                itemsPerCarton: Number(item.itemsPerCarton) || 0,
                totalCartons: Number(item.totalCartons) || 0,
                cartonCBM: Number(item.cartonCBM) || 0,
                totalCBM: Number(item.totalCBM) || 0,
                hsCode: item.hsCode || '',
                netWeight: Number(item.netWeight) || 0,
                totalNetWeight: Number(item.totalNetWeight) || 0,
                grossWeight: Number(item.grossWeight) || 0,
                totalGrossWeight: Number(item.totalGrossWeight) || 0,
                attributes: item.attributes || [],
                checklist: [],
                templateIds: [],
                unit: item.unit,
            }
        });

        // --- POST-PROCESSING LOGIC (in code, not AI) ---
        
        // 1. Distribute summarized totals if per-item data is missing
        const orderTotals = parsedJson.orderTotals;
        const grandTotalCartons = orderTotals?.totalCartons;
        if (grandTotalCartons > 0 && poItems.every(item => (item.totalCartons || 0) > 0)) {
            const sumOfItemCartons = poItems.reduce((sum, item) => sum + (item.totalCartons || 0), 0);
            if (Math.abs(sumOfItemCartons - grandTotalCartons) < 5) { // Check if sums match
                 poItems.forEach(item => {
                    const cartonShare = (item.totalCartons || 0) / grandTotalCartons;
                    if (!item.totalCBM && orderTotals.totalCBM) {
                        item.totalCBM = cartonShare * orderTotals.totalCBM;
                    }
                    if (!item.totalGrossWeight && orderTotals.totalGrossWeight) {
                        item.totalGrossWeight = cartonShare * orderTotals.totalGrossWeight;
                    }
                    if (!item.totalNetWeight && orderTotals.totalNetWeight) {
                        item.totalNetWeight = cartonShare * orderTotals.totalNetWeight;
                    }
                });
            }
        }

        // 2. Calculate missing values from other available data for each item
        poItems.forEach(item => {
            // Calculate total cartons if possible
            if (!item.totalCartons && item.quantity > 0 && item.itemsPerCarton > 0) {
                item.totalCartons = Math.ceil(item.quantity / item.itemsPerCarton);
            }
            // Calculate per-carton metrics from totals
            if (item.totalCartons > 0) {
                if (!item.cartonCBM && item.totalCBM && item.totalCBM > 0) item.cartonCBM = parseFloat((item.totalCBM / item.totalCartons).toFixed(3));
                if (!item.grossWeight && item.totalGrossWeight && item.totalGrossWeight > 0) item.grossWeight = parseFloat((item.totalGrossWeight / item.totalCartons).toFixed(2));
                if (!item.netWeight && item.totalNetWeight && item.totalNetWeight > 0) item.netWeight = parseFloat((item.totalNetWeight / item.totalCartons).toFixed(2));
            }
        });
        
        const poData: NewOrderData = {
            supplier: parsedJson.supplier || '',
            internalCode: parsedJson.internalCode || '',
            orderDate: parsedJson.orderDate || '',
            approxLoadingDate: parsedJson.approxLoadingDate || '',
            originPort: parsedJson.originPort || '',
            destinationPort: parsedJson.destinationPort || '',
            currency: currency,
            purchaseType: (parsedJson.purchaseType === 'credit' ? 'credit' : 'cash') as 'cash' | 'credit',
            items: poItems.map(item => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { totalCartons, totalCBM, totalNetWeight, totalGrossWeight, unit, ...orderItemFields } = item;
                return orderItemFields;
            }),
            payments: (parsedJson.payments || []).map((p: any) => ({
                type: p.type,
                amountUSD: p.amountUSD,
                date: p.date || '',
            })),
        };
        
        if(poData.items.length === 0) {
            poData.items.push({
                internalCode: '', productName: '', quantity: 0, price: 0, 
                itemsPerCarton: 0, cartonCBM: 0, hsCode: '', netWeight: 0,
                grossWeight: 0, attributes: [], checklist: [], templateIds: [],
            });
        }
        
        return poData;

    } catch (error) {
        console.error("Error analyzing purchase order with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}

export async function getHSCodeForProduct(productName: string, productAttributes: OrderItemAttribute[], apiKey: string, model: string): Promise<string> {
    if (!productName.trim()) {
        return '';
    }
    try {
        const ai = new GoogleGenAI({ apiKey });

        const attributesText = productAttributes.map(attr => `- ${attr.key}: ${attr.value}`).join('\n');
        
        const systemInstruction = `You are a customs classification expert specializing in the UAE (United Arab Emirates) customs tariff system. Your task is to provide the most likely 6 or 8-digit HS code for a given product using Google Search. Respond with ONLY the HS code and nothing else. Do not add any explanation or surrounding text. For example, if the code is 8509.40, your entire response should be "8509.40".`;
        
        const userContent = `
Using Google Search, find the official UAE Harmonized System (HS) code for the following product.
Product Name: "${productName}"
Product Type: Home Appliance / Consumer Goods
Known Attributes:
${attributesText || 'No specific attributes provided.'}
`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
                tools: [{googleSearch: {}}],
            },
        });

        const hsCode = response.text.trim().replace(/[^0-9.]/g, '');

        if (hsCode) {
            return hsCode;
        }
        
        console.warn("AI did not return a valid HS code using search for:", productName);
        return '';

    } catch (error) {
        console.error(`Error fetching HS Code for "${productName}":`, error);
        return ''; 
    }
}


// --- AI Product Categorization ---
const categoryMatchSchema = {
    type: Type.OBJECT,
    properties: {
        matchType: {
            type: Type.STRING,
            description: "Set to 'existing' if the product can be fully categorized under an existing Brand. Set to 'new' if it requires a new category, sub-category, or brand.",
        },
        existingIds: {
            type: Type.OBJECT,
            description: "Use this field ONLY if matchType is 'existing'. Populate it with the IDs of the best matching existing hierarchy.",
            properties: {
                mainGroupId: { type: Type.STRING, description: "The ID of the existing Main Group." },
                categoryId: { type: Type.STRING, description: "The ID of the existing Category." },
                subCategoryId: { type: Type.STRING, description: "The ID of the existing Sub-Category." },
                brandId: { type: Type.STRING, description: "The ID of the existing Brand." },
            },
        },
        newNames: {
            type: Type.OBJECT,
            description: "Use this field ONLY if matchType is 'new'. Provide the full hierarchy of names, whether they are new or existing. The system will create any that don't exist.",
            properties: {
                mainGroup: { type: Type.STRING, description: "The English name of the Main Group." },
                mainGroup_fa: { type: Type.STRING, description: "The Persian (Farsi) translation of the Main Group name." },
                category: { type: Type.STRING, description: "The English name of the Category." },
                category_fa: { type: Type.STRING, description: "The Persian (Farsi) translation of the Category name." },
                subCategory: { type: Type.STRING, description: "The English name of the Sub-Category." },
                subCategory_fa: { type: Type.STRING, description: "The Persian (Farsi) translation of the Sub-Category name." },
                brand: { type: Type.STRING, description: "The brand name. **CRITICAL**: This must always be 'Newland' regardless of the product name." },
            },
        },
    },
    required: ['matchType'],
};

export async function categorizeProductWithAI(
    productName: string,
    existingStructure: {
        mainGroups: MainGroup[],
        categories: Category[],
        subCategories: SubCategory[],
        brands: Brand[]
    },
    apiKey: string,
    model: string
): Promise<CategorizationResult> {
    try {
        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `You are a product categorization expert. Your task is to categorize the given product into an existing hierarchy or suggest a new one.

**Instructions:**
1.  Analyze the Product Name and determine its most logical placement within the hierarchy.
2.  **Existing Match:** If you find a perfect match down to an existing **Brand** that correctly fits the product, set \`matchType\` to \`'existing'\` and provide the full ID chain (\`mainGroupId\`, \`categoryId\`, \`subCategoryId\`, \`brandId\`) in the \`existingIds\` object.
3.  **New Item:** If the product represents a new brand, a new sub-category, or a new category, set \`matchType\` to \`'new'\`.
    -   In the \`newNames\` object, provide the full hierarchy of **names** you think is best. The system will handle creating new entries or reusing existing ones.
    -   **CRITICAL**: For \`newNames\`, you MUST provide both the English name and the Persian (Farsi) translation for \`mainGroup\`, \`category\`, and \`subCategory\` in their respective \`_fa\` fields.
    -   **CRITICAL**: The brand name MUST ALWAYS be "Newland". Do not infer it from the product title.
    -   If the product is entirely new and doesn't fit anywhere, propose a logical full new hierarchy of names (e.g., "Home Appliances" -> "Kitchen" -> "Blenders") with their Persian translations.
4.  Your response must strictly be a JSON object matching the provided schema.`;
        
        const userContent = `
**Product Name:** "${productName}"

**Existing Hierarchy (with IDs):**
- Main Groups: ${JSON.stringify(existingStructure.mainGroups.map(({ id, name }) => ({ id, name })))}
- Categories: ${JSON.stringify(existingStructure.categories.map(({ id, name, mainGroupId }) => ({ id, name, mainGroupId })))}
- Sub-Categories: ${JSON.stringify(existingStructure.subCategories.map(({ id, name, categoryId }) => ({ id, name, categoryId })))}
- Brands: ${JSON.stringify(existingStructure.brands.map(({ id, name, subCategoryId }) => ({ id, name, subCategoryId })))}
`;

        const response = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: categoryMatchSchema,
            },
        });

        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        if (parsedJson.matchType === 'existing' && !parsedJson.existingIds) {
            throw new Error("AI response has matchType 'existing' but is missing the 'existingIds' object.");
        }
        if (parsedJson.matchType === 'new' && !parsedJson.newNames) {
            throw new Error("AI response has matchType 'new' but is missing the 'newNames' object.");
        }

        return parsedJson as CategorizationResult;

    } catch (error) {
        console.error("Error categorizing product with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}


// --- AI Checklist Generation ---
const checklistGenerationSchema = {
    type: Type.ARRAY,
    description: "A list of checklist sections for a product development or QC process.",
    items: {
        type: Type.OBJECT,
        properties: {
            section_en: { type: Type.STRING, description: "The name of the section in English (e.g., 'Pre-Production', 'Packaging')." },
            section_fa: { type: Type.STRING, description: "The name of the section in Persian (Farsi)." },
            tasks: {
                type: Type.ARRAY,
                description: "A list of tasks within this section.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        task_en: { type: Type.STRING, description: "The task description in English." },
                        task_fa: { type: Type.STRING, description: "The task description in Persian (Farsi)." },
                        task_weight: { type: Type.NUMBER, description: "A weight for the task, always set to 1." }
                    },
                    required: ['task_en', 'task_fa', 'task_weight']
                }
            }
        },
        required: ['section_en', 'section_fa', 'tasks']
    }
};


export async function generateChecklistFromDescription(description: string, model: string, apiKey: string): Promise<GeneratedSection[]> {
     try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = `Act as a quality control and product development expert for consumer goods. You will be given a product description. Create a comprehensive quality control and development checklist. The checklist must be broken down into logical sections (e.g., "Specifications", "Packaging", "Compliance"). For each section, provide a list of specific tasks. You must provide both English and Persian (Farsi) translations for all section and task names. Your response must be a JSON object matching the provided schema.`;
        const userContent = `Product Description:\n---\n${description}\n---`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: checklistGenerationSchema,
            },
        });

        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        if (Array.isArray(parsedJson) && parsedJson.every(s => 'section_en' in s && 'tasks' in s && Array.isArray(s.tasks))) {
            return parsedJson as GeneratedSection[];
        } else {
            console.error("AI checklist response was not in the expected format:", parsedJson);
            throw new Error("AI response format is invalid for a checklist.");
        }
    } catch (error) {
        console.error("Error generating checklist with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}

// --- AI Project Generation ---
const projectGenerationSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'A concise and clear name for the project.' },
    description: { type: Type.STRING, description: 'A brief, one-sentence description of the project goal.' },
    columns: {
      type: Type.ARRAY,
      description: 'A list of Kanban columns representing project stages (e.g., "Planning", "Execution", "Launch", "Done"). Generate between 3 to 5 relevant stages.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'The name of the Kanban column.' },
          tasks: {
            type: Type.ARRAY,
            description: 'A list of 2-4 essential tasks within this column.',
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'A clear and actionable title for the task.' },
                description: { type: Type.STRING, description: 'An optional, more detailed description of the task.' },
                checklist: {
                  type: Type.ARRAY,
                  description: 'An optional list of 2-5 sub-items for this task.',
                  items: { type: Type.STRING }
                }
              },
              required: ['title']
            }
          }
        },
        required: ['name', 'tasks']
      }
    }
  },
  required: ['name', 'columns']
};

export async function generateProjectFromPrompt(prompt: string, model: string, apiKey: string): Promise<AIProjectStructure> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = `You are a world-class project manager. Based on the user's project goal, create a complete project plan. The plan should include a project name, a brief description, a set of logical Kanban columns (stages), and for each column, a list of relevant tasks. Some tasks should also have a simple checklist of sub-items.`;
        const userContent = `User's Project Goal:\n---\n${prompt}\n---`;

        const response = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: projectGenerationSchema,
            },
        });

        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        return parsedJson as AIProjectStructure;

    } catch (error) {
        console.error("Error generating project with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}

// --- AI Order Analysis ---
const analysisSchema = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.STRING,
            description: "A human-readable, bulleted markdown list summarizing all found issues. If no issues, this should be 'OK'."
        },
        issues: {
            type: Type.ARRAY,
            description: "A machine-readable list of specific issues found. Each issue must correspond to a field in the input JSON.",
            items: {
                type: Type.OBJECT,
                properties: {
                    field: {
                        type: Type.STRING,
                        description: "The JSON path to the problematic field. For items in the array, use 'items.INDEX.fieldName' format (e.g., 'items.0.quantity', 'items.1.grossWeight'). For top-level fields, just use the field name (e.g., 'supplier', 'approxLoadingDate')."
                    },
                    message: {
                        type: Type.STRING,
                        description: "A concise error message explaining what is wrong with that specific field."
                    }
                },
                required: ['field', 'message']
            }
        }
    },
    required: ['summary', 'issues']
};

export async function analyzeOrderForIssues(order: Order, settings: CostingSettings, model: string, apiKey: string): Promise<{ summary: string; issues: AnalysisIssue[] }> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        
        const systemInstruction = `You are a logistics and costing expert. Your task is to analyze the provided JSON data for a purchase order and identify potential issues that would cause calculation errors or are very likely to be data entry mistakes. Your response must be a JSON object matching the provided schema.`;

        const prompt = `Please analyze the following order data and settings. Identify only CRITICAL issues that will break calculations or are clear mistakes.

        Order JSON:
        \`\`\`json
        ${JSON.stringify(order, null, 2)}
        \`\`\`
        
        Costing Settings JSON:
        \`\`\`json
        ${JSON.stringify(settings, null, 2)}
        \`\`\`
        
        **CRITICAL INSTRUCTIONS for your JSON response:**
        - Your output MUST be a JSON object with two keys: 'summary' and 'issues'.
        - 'summary': Create a human-readable, bulleted markdown list of all findings. If no issues are found, this value must be the exact string "OK".
        - 'issues': Create a machine-readable array of objects.
            - Each object must have a 'field' key (the JSON path to the problematic field) and a 'message' key (a concise error description).
            - For items in an array, use the format 'items.INDEX.fieldName' (e.g., 'items.0.grossWeight').
            - For top-level order fields, use the field name directly (e.g., "approxLoadingDate").
            - If no issues are found, this must be an empty array [].

        **Critical Issues to Check For:**
        - **Division by Zero:** An item has a 'quantity' > 0 but its 'itemsPerCarton' is 0 or negative.
        - **Logical Errors:** An item's 'netWeight' is greater than its 'grossWeight'. The 'approxLoadingDate' is earlier than the 'orderDate'.
        - **Negative Values:** Critical numeric fields like 'quantity', 'price', 'itemsPerCarton', 'cartonCBM', 'netWeight', 'grossWeight', 'customsValue' contain negative values.
        - **Allocation Errors:** A cost is allocated by 'cbm', but the order's total CBM is 0. A cost is allocated by 'value', but the order's total value is 0.
        - **Customs Calculation Issues:** An item has a customs basis of 'kg' but its 'grossWeight' is 0 or missing. An item has a 'customsValue' of 0 or it's missing, which is a common cause for incorrect Iran customs calculations.
        - **Unusual Values for Physical Goods:** An item has a 'quantity' > 0 but its 'cartonCBM' is 0 or missing.
        - **Configuration Errors:** Any currency exchange rate in the settings is 0 or negative.

        **What NOT to Report:**
        - Do not report missing optional fields like 'internalCode', 'originPort', 'destinationPort', 'hsCode', 'netWeight' (unless basis is 'kg'), or 'productNameFa'. These are often intentionally blank.
        - Do not report on floating point precision issues.
        `;

        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: analysisSchema,
            },
        });
        
        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        if (typeof parsedJson.summary === 'string' && Array.isArray(parsedJson.issues)) {
            return parsedJson as { summary: string; issues: AnalysisIssue[] };
        } else {
            console.error("AI response did not match the expected structure:", parsedJson);
            throw new Error("AI response did not match the expected structure.");
        }

    } catch (error) {
        console.error("Error analyzing order with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}

// --- AI Brochure Content Generation ---
export async function generateMarketingCopy(
    productName: string,
    attributes: { key: string; value: string }[],
    apiKey: string,
    model: string
): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        const attributesText = attributes.map(attr => `- ${attr.key}: ${attr.value}`).join('\n');
        const systemInstruction = `You are a professional marketing copywriter. Write a compelling, customer-focused marketing description for the provided product. Use an engaging and persuasive tone. The description should be a single paragraph of about 50-70 words.`;
        const userContent = `Product Name: ${productName}\n\nKey Features:\n${attributesText}`;

        const response = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
            },
        });

        return response.text.trim();

    } catch (error) {
        console.error("Error generating marketing copy with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}

const translationSchema = {
    type: Type.OBJECT,
    properties: {
        marketingCopy_fa: {
            type: Type.STRING,
            description: "The Persian (Farsi) translation of the marketing copy.",
        },
        translatedAttributes: {
            type: Type.ARRAY,
            description: "An array of translated attributes.",
            items: {
                type: Type.OBJECT,
                properties: {
                    id: {
                        type: Type.STRING,
                        description: "The original, unmodified ID of the attribute being translated.",
                    },
                    key_fa: {
                        type: Type.STRING,
                        description: "The Persian (Farsi) translation of the attribute's key.",
                    },
                    value_fa: {
                        type: Type.STRING,
                        description: "The Persian (Farsi) translation of the attribute's value.",
                    },
                },
                required: ["id", "key_fa", "value_fa"],
            },
        },
    },
    required: ["marketingCopy_fa", "translatedAttributes"],
};

export async function translateBrochureContent(
    englishContent: BrochureTranslationInput,
    apiKey: string,
    model: string
): Promise<BrochureTranslationOutput> {
     try {
        const ai = new GoogleGenAI({ apiKey });
        const systemInstruction = `You are an expert translator specializing in technical and marketing content from English to Persian (Farsi). Translate the following JSON object's content accurately. Maintain the original JSON structure and return a JSON object that matches the provided schema. The 'id' field for each attribute must be passed through unchanged.`;
        const userContent = `JSON to Translate:\n---\n${JSON.stringify(englishContent)}\n---`;

        const response = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: translationSchema,
            },
        });
        
        const jsonString = response.text.trim();
        const parsedJson = JSON.parse(jsonString);

        if (parsedJson && typeof parsedJson.marketingCopy_fa === 'string' && Array.isArray(parsedJson.translatedAttributes)) {
            return parsedJson as BrochureTranslationOutput;
        }

        console.error("AI translation response was not in the expected format:", parsedJson);
        throw new Error("AI translation response format is invalid.");

    } catch (error) {
        console.error("Error translating content with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}

export async function generateWarningNoteFromTopic(
    topic: string,
    model: string,
    apiKey: string
): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        
        const systemInstruction = `You are a helpful assistant and an expert analyst. Your task is to generate a detailed, useful, and cautionary note about a given topic. The response should be well-structured and written in Persian if the topic is in Persian, otherwise in English.

The note must follow this structure:
1.  **Key Points (نکات کلیدی):** A bulleted list of the most important aspects of the topic.
2.  **Warnings & Considerations (تذکرات و ملاحظات):** A bulleted list of potential risks, common mistakes, or important things to pay attention to. This section should have a cautionary tone.
3.  **Solutions & Strategies (راهکارها و استراتژی‌ها):** A bulleted list of actionable advice, best practices, or solutions to the potential problems mentioned above.
4.  **Summary (جمع‌بندی):** A brief, one or two-sentence summary of the most critical takeaway.

Format the entire output as a single block of text with clear headings for each section. Use markdown for formatting (e.g., '#' for headings, '*' for list items).`;

        const userContent = `Topic: "${topic}"\n\nPlease generate a detailed, structured, cautionary note about this topic.`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: userContent,
            config: {
                systemInstruction,
            },
        });

        return response.text.trim();
    } catch (error) {
        console.error("Error generating warning note with AI:", error);
        throw new Error(getApiErrorMessage(error));
    }
}