import { Order, OrderItem, CostingSettings, Product, Cost, ProductIranCustomsCosts, CurrencyRates } from '../types';

/**
 * A robust calculation utility. It wraps any calculation and ensures that the result
 * is a valid, finite number, defaulting to 0 otherwise. This prevents `NaN` or `Infinity`
 * from propagating through the calculation chain.
 * @param calc - A function that returns a number.
 * @returns A valid, finite number.
 */
const safeCalc = (calc: () => number, defaultValue: number = 0): number => {
    try {
        const result = calc();
        return isFinite(result) ? result : defaultValue;
    } catch {
        return defaultValue;
    }
};

// Helper to allocate a set of costs and return per-unit allocation, handling rounding discrepancies.
const allocateCosts = (
    costs: Cost[] | undefined,
    itemsToAllocate: OrderItem[],
    itemMetrics: Map<string, { totalValueUSD: number; quantity: number; totalCartons: number; totalCBM: number; totalGrossWeight: number; }>,
    targetCurrency: 'USD' | 'AED' | 'TOMAN',
    settings: CostingSettings
): Map<string, number> => {
    const perUnitCosts = new Map<string, number>(itemsToAllocate.map(i => [i.id, 0]));
    if (!costs || costs.length === 0) return perUnitCosts;

    const usdToCnyRate = safeCalc(() => settings.fx.usd_aed * settings.fx.aed_cny);
    const cnyToUsdRate = safeCalc(() => 1 / usdToCnyRate);

    costs.forEach(cost => {
        const itemsInScope = cost.itemId ? itemsToAllocate.filter(i => i.id === cost.itemId) : itemsToAllocate;
        if (itemsInScope.length === 0) return;

        const scopeTotalValue = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalValueUSD || 0), 0);
        const scopeTotalQty = itemsInScope.reduce((sum, item) => sum + item.quantity, 0);
        const scopeTotalCartons = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalCartons || 0), 0);
        const scopeTotalCBM = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalCBM || 0), 0);
        const scopeTotalGrossWeight = itemsInScope.reduce((sum, item) => sum + (itemMetrics.get(item.id)?.totalGrossWeight || 0), 0);

        const amountInTargetCurrency = safeCalc(() => {
            if (cost.currency === targetCurrency) return cost.amount;
            let usdAmount = 0;
            switch (cost.currency) {
                case 'USD': usdAmount = cost.amount; break;
                case 'AED': usdAmount = safeCalc(() => cost.amount / settings.fx.usd_aed); break;
                case 'TOMAN': usdAmount = safeCalc(() => cost.amount / (settings.fx.usd_aed * settings.fx.aed_toman)); break;
                case 'CNY': usdAmount = cost.amount * cnyToUsdRate; break;
            }
            switch (targetCurrency) {
                case 'USD': return usdAmount;
                case 'AED': return usdAmount * settings.fx.usd_aed;
                case 'TOMAN': return usdAmount * settings.fx.usd_aed * settings.fx.aed_toman;
                default: return 0;
            }
        });

        // Use remainder distribution to prevent floating-point inaccuracies
        let allocatedSum = 0;
        const allocations = new Map<string, number>();
        let highestValueItemId: string | null = null;
        let highestValue = -1;

        itemsInScope.forEach(item => {
            const metrics = itemMetrics.get(item.id)!;
            let share = 0;
            switch (cost.basis) {
                case 'value':  share = scopeTotalValue > 0 ? metrics.totalValueUSD / scopeTotalValue : 1 / itemsInScope.length; break;
                case 'qty':    share = scopeTotalQty > 0 ? item.quantity / scopeTotalQty : 1 / itemsInScope.length; break;
                case 'carton': share = scopeTotalCartons > 0 ? metrics.totalCartons / scopeTotalCartons : 1 / itemsInScope.length; break;
                case 'cbm':    share = scopeTotalCBM > 0 ? metrics.totalCBM / scopeTotalCBM : 1 / itemsInScope.length; break;
                case 'grossWeight': share = scopeTotalGrossWeight > 0 ? metrics.totalGrossWeight / scopeTotalGrossWeight : 1 / itemsInScope.length; break;
                case 'equal':  share = 1 / itemsInScope.length; break;
            }

            const itemAllocation = amountInTargetCurrency * share;
            const roundedAllocation = parseFloat(itemAllocation.toFixed(4));
            allocations.set(item.id, roundedAllocation);
            allocatedSum += roundedAllocation;
            if (metrics.totalValueUSD > highestValue) {
                highestValue = metrics.totalValueUSD;
                highestValueItemId = item.id;
            }
        });
        
        const remainder = amountInTargetCurrency - allocatedSum;
        if (remainder !== 0 && highestValueItemId) {
            allocations.set(highestValueItemId, (allocations.get(highestValueItemId) || 0) + remainder);
        }

        allocations.forEach((totalAllocation, itemId) => {
            const item = itemsInScope.find(i => i.id === itemId);
            if (item) {
                const perUnit = safeCalc(() => totalAllocation / item.quantity);
                perUnitCosts.set(itemId, (perUnitCosts.get(itemId) || 0) + perUnit);
            }
        });
    });

    return perUnitCosts;
};

export const calculateIranCustomsCosts = (item: OrderItem, settings: CostingSettings): ProductIranCustomsCosts => {
    // If customs value is not set (i.e., not applied), all customs costs are zero.
    if (!item.customsValue || item.customsValue <= 0) {
        return {
            finalDuty_TOMAN: 0, importVat_TOMAN: 0, brokerFee_TOMAN: 0,
            shipFreight_TOMAN: 0, inlandFreight_TOMAN: 0, standardFee_TOMAN: 0,
            loadingUnloadingFee_TOMAN: 0
        };
    }

    const ic = settings.iranCustoms;
    const grossWeightPerUnit = safeCalc(() => (item.grossWeight || 0) / item.itemsPerCarton);
    const baseValueUsd = safeCalc(() => item.customsValueBasis === 'kg' ? (item.customsValue || 0) * grossWeightPerUnit : (item.customsValue || 0));
    
    const dutyBaseToman = safeCalc(() => baseValueUsd * ic.customsUsdRate);
    const finalDuty = safeCalc(() => {
        const totalTariff = safeCalc(() => (ic.servicesTariffRate / 100) + (ic.importDutyRate / 100));
        const duty = dutyBaseToman * totalTariff;
        const postVat = safeCalc(() => duty * (ic.postCustomsVatRate / 100));
        return duty + postVat;
    });

    const importVat = safeCalc(() => (baseValueUsd * ic.vatUsdRate) * (ic.importVatRate / 100));
    const brokerFee = safeCalc(() => (ic.brokerFeePerCarton / item.itemsPerCarton) * (1 + ic.servicesVatRate / 100));
    const shipFreight = safeCalc(() => (ic.woodenShipFreightRate / ic.woodenShipFreightVolume * item.cartonCBM / item.itemsPerCarton) * (1 + ic.woodenShipFreightVatRate / 100));
    const inlandFreight = safeCalc(() => (ic.inlandFreightRate / ic.inlandFreightVolume * item.cartonCBM / item.itemsPerCarton) * (1 + ic.inlandFreightVatRate / 100));
    const standardFee = safeCalc(() => (dutyBaseToman * (ic.standardFeeRate / 100)) * (1 + (ic.standardFeeVatRate || 0) / 100));
    const loadingUnloadingFee = safeCalc(() => {
        const weightInTons = grossWeightPerUnit / 1000;
        const totalFeePerTon = ic.unloadingFeePerTon + ic.loadingFeePerTon;
        const avgVatRate = safeCalc(() => ((ic.unloadingFeeVatRate || 0) + (ic.loadingFeeVatRate || 0)) / 200);
        return (weightInTons * totalFeePerTon) * (1 + avgVatRate);
    });

    return {
        finalDuty_TOMAN: finalDuty, importVat_TOMAN: importVat, brokerFee_TOMAN: brokerFee,
        shipFreight_TOMAN: shipFreight, inlandFreight_TOMAN: inlandFreight, standardFee_TOMAN: standardFee,
        loadingUnloadingFee_TOMAN: loadingUnloadingFee
    };
};

export const recalculateProductPrices = (product: Product, liveSettings: CostingSettings): Product => {
    const p = { ...product }; // Create a mutable copy
    const { fx, pricingTiers, vat, rounding } = liveSettings;

    p.iranCustomsCosts = calculateIranCustomsCosts(p as unknown as OrderItem, liveSettings);
    
    p.landedCostUSD = safeCalc(() => p.purchasePriceUSD + p.shipStageCostsUSD);
    p.landedCostAED = safeCalc(() => (p.landedCostUSD * fx.usd_aed) + p.dubaiStageCostsAED);
    const totalSystemIranCosts = Object.values(p.iranCustomsCosts).reduce((sum, val) => sum + (val || 0), 0);
    p.landedCostTOMAN = safeCalc(() => (p.landedCostAED * fx.aed_toman) + p.iranStageCostsTOMAN + totalSystemIranCosts);

    const round = (value: number, rule: number) => rule > 0 ? Math.round(value / rule) * rule : value;
    const isMargin = pricingTiers.calculationMethod === 'margin';
    
    const calculateSP = (cost: number, tierValue: number) => safeCalc(() => 
        isMargin ? cost / (1 - (tierValue / 100)) : cost * (1 + (tierValue / 100))
    );

    const getFinalPrice = (calculated: number, rule: number, vatMultiplier: number, override?: number) =>
        override !== undefined ? override : round(calculated * vatMultiplier, rule);

    const vatMultipliers = {
        aed: safeCalc(() => vat.aed.enabled ? 1 + vat.aed.value / 100 : 1),
        toman: safeCalc(() => vat.toman.enabled ? 1 + vat.toman.value / 100 : 1),
    };

    p.sellingPrices = {
        aed: {
            tier1: getFinalPrice(calculateSP(p.landedCostAED, pricingTiers.aed.tier1), rounding.aed, vatMultipliers.aed, p.pricingTiersOverrides?.aed?.tier1),
            tier2: getFinalPrice(calculateSP(p.landedCostAED, pricingTiers.aed.tier2), rounding.aed, vatMultipliers.aed, p.pricingTiersOverrides?.aed?.tier2),
            tier3: getFinalPrice(calculateSP(p.landedCostAED, pricingTiers.aed.tier3), rounding.aed, vatMultipliers.aed, p.pricingTiersOverrides?.aed?.tier3),
        },
        toman: {
            tier1: getFinalPrice(calculateSP(p.landedCostTOMAN, pricingTiers.toman.tier1), rounding.toman, vatMultipliers.toman, p.pricingTiersOverrides?.toman?.tier1),
            tier2: getFinalPrice(calculateSP(p.landedCostTOMAN, pricingTiers.toman.tier2), rounding.toman, vatMultipliers.toman, p.pricingTiersOverrides?.toman?.tier2),
            tier3: getFinalPrice(calculateSP(p.landedCostTOMAN, pricingTiers.toman.tier3), rounding.toman, vatMultipliers.toman, p.pricingTiersOverrides?.toman?.tier3),
        }
    };
    return p;
};

export function calculateFinalProducts(order: Order, settings: CostingSettings): Omit<Product, 'id' | 'finalizedAt' | 'settingsSnapshot' | 'deletedAt'>[] {
    const { fx } = settings;
    const currencyRates: CurrencyRates = {
      aed: fx.usd_aed,
      toman: fx.usd_aed * fx.aed_toman,
      cny: safeCalc(() => 1 / (fx.usd_aed * fx.aed_cny)),
    };
    
    const itemMetrics = new Map(order.items.map(item => {
        let priceInUsd = item.price;
        switch (order.currency) {
            case 'AED': priceInUsd = currencyRates.aed > 0 ? item.price / currencyRates.aed : 0; break;
            case 'TOMAN': priceInUsd = currencyRates.toman > 0 ? item.price / currencyRates.toman : 0; break;
            case 'CNY': priceInUsd = item.price * currencyRates.cny; break;
            default: break;
        }
        const totalCartons = safeCalc(() => Math.ceil(item.quantity / item.itemsPerCarton));
        return [
            item.id,
            {
                totalCartons,
                totalCBM: safeCalc(() => totalCartons * item.cartonCBM),
                totalValueUSD: priceInUsd * item.quantity,
                quantity: item.quantity,
                totalGrossWeight: safeCalc(() => (item.grossWeight || 0) * totalCartons)
            }
        ];
    }));

    const isFixed = (c: Cost) => !c.basis.startsWith('percent_');
    const isPercent = (c: Cost) => c.basis.startsWith('percent_');

    const fixedShipCosts = allocateCosts(order.shipCosts?.filter(isFixed), order.items, itemMetrics, 'USD', settings);
    const fixedDubaiCosts = allocateCosts(order.dubaiCosts?.filter(isFixed), order.items, itemMetrics, 'AED', settings);
    const manualIranCostsArr = order.iranCosts?.filter(c => c.category !== 'system_customs');
    const fixedIranCosts = allocateCosts(manualIranCostsArr?.filter(isFixed), order.items, itemMetrics, 'TOMAN', settings);

    const percentShipCosts = order.shipCosts?.filter(isPercent) || [];
    const percentDubaiCosts = order.dubaiCosts?.filter(isPercent) || [];
    const percentIranCosts = manualIranCostsArr?.filter(isPercent) || [];
    
    const hasAppliedCustoms = order.iranCosts?.some(c => c.category === 'system_customs');

    return order.items.map(item => {
        let priceInUsd = item.price;
         switch (order.currency) {
            case 'AED': priceInUsd = currencyRates.aed > 0 ? item.price / currencyRates.aed : 0; break;
            case 'TOMAN': priceInUsd = currencyRates.toman > 0 ? item.price / currencyRates.toman : 0; break;
            case 'CNY': priceInUsd = currencyRates.cny > 0 ? item.price * currencyRates.cny : 0; break;
            default: break;
        }

        // --- Ship Stage Costs ---
        const baseShipCostsPerUnitUSD = fixedShipCosts.get(item.id) || 0;
        let percentBasedShipCostsUSD = 0;
        percentShipCosts.forEach(cost => {
            if (cost.basis === 'percent_purchase_usd') {
                percentBasedShipCostsUSD += priceInUsd * (cost.amount / 100);
            }
        });
        const totalShipCostsPerUnitUSD = baseShipCostsPerUnitUSD + percentBasedShipCostsUSD;

        // --- Dubai Stage Costs ---
        const baseDubaiCostsPerUnitAED = fixedDubaiCosts.get(item.id) || 0;
        const landedCostDubaiAED_before_percent = ((priceInUsd + totalShipCostsPerUnitUSD) * fx.usd_aed) + baseDubaiCostsPerUnitAED;
        let percentBasedDubaiCostsAED = 0;
        percentDubaiCosts.forEach(cost => {
            if (cost.basis === 'percent_purchase_usd') {
                percentBasedDubaiCostsAED += (priceInUsd * fx.usd_aed) * (cost.amount / 100);
            } else if (cost.basis === 'percent_landed_aed') {
                percentBasedDubaiCostsAED += landedCostDubaiAED_before_percent * (cost.amount / 100);
            }
        });
        const totalDubaiCostsPerUnitAED = baseDubaiCostsPerUnitAED + percentBasedDubaiCostsAED;

        // --- Iran Stage Costs ---
        const landedCostDubaiAED_for_iran_calc = landedCostDubaiAED_before_percent + percentBasedDubaiCostsAED;
        const baseIranCostsPerUnitTOMAN = fixedIranCosts.get(item.id) || 0;
        const totalIranCustomsCostsPerUnit = Object.values(calculateIranCustomsCosts(item, settings)).reduce((sum, val) => sum + (val || 0), 0);
        const landedCostToman_before_percent = (landedCostDubaiAED_for_iran_calc * fx.aed_toman) + baseIranCostsPerUnitTOMAN + totalIranCustomsCostsPerUnit;
        
        let percentBasedIranCostsTOMAN = 0;
        percentIranCosts.forEach(cost => {
            if(cost.basis === 'percent_purchase_usd'){
                percentBasedIranCostsTOMAN += (priceInUsd * currencyRates.toman) * (cost.amount / 100);
            } else if (cost.basis === 'percent_landed_aed') {
                percentBasedIranCostsTOMAN += (landedCostDubaiAED_for_iran_calc * fx.aed_toman) * (cost.amount / 100);
            } else if (cost.basis === 'percent_landed_toman') {
                percentBasedIranCostsTOMAN += landedCostToman_before_percent * (cost.amount / 100);
            }
        });
        const totalManualIranCostsPerUnitTOMAN = baseIranCostsPerUnitTOMAN + percentBasedIranCostsTOMAN;

        const productSkeleton: Product = {
            id: item.id,
            internalCode: item.internalCode || '',
            supplierCode: item.supplierCode,
            oldSystemCode: '',
            description: item.productName,
            productNameFa: item.productNameFa,
            itemsPerCarton: item.itemsPerCarton,
            netWeight: item.netWeight,
            grossWeight: item.grossWeight,
            cartonCBM: item.cartonCBM,
            hsCode: item.hsCode,
            attributes: item.attributes,
            customsValue: hasAppliedCustoms ? item.customsValue : undefined,
            customsValueBasis: hasAppliedCustoms ? item.customsValueBasis : undefined,
            mainGroupId: item.mainGroupId,
            categoryId: item.categoryId,
            subCategoryId: item.subCategoryId,
            brandId: item.brandId,
            purchasePriceUSD: priceInUsd,
            purchasePriceInSourceCurrency: item.price,
            sourceCurrency: order.currency,
            shipStageCostsUSD: totalShipCostsPerUnitUSD,
            dubaiStageCostsAED: totalDubaiCostsPerUnitAED,
            iranStageCostsTOMAN: totalManualIranCostsPerUnitTOMAN,
            iranCustomsCosts: {} as ProductIranCustomsCosts,
            landedCostUSD: 0, landedCostAED: 0, landedCostTOMAN: 0,
            sellingPrices: { aed: { tier1: 0, tier2: 0, tier3: 0 }, toman: { tier1: 0, tier2: 0, tier3: 0 } },
            sourceOrderId: order.id,
            finalizedAt: '',
            settingsSnapshot: settings,
            deletedAt: null,
            order: 0,
            createdAt: new Date().toISOString(),
        };

        const finalProduct = recalculateProductPrices(productSkeleton, settings);
        const { id, finalizedAt, settingsSnapshot, deletedAt, ...rest } = finalProduct;
        return rest;
    });
}