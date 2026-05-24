function formatKRW(value) {
  const numberValue = Number(value) || 0;
  const absValue = Math.abs(numberValue);

  if (absValue >= 100000000) {
    return (numberValue / 100000000).toLocaleString("ko-KR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + "억 원";
  }

  if (absValue >= 10000) {
    return Math.round(numberValue / 10000).toLocaleString("ko-KR") + "만 원";
  }

  return numberValue.toLocaleString("ko-KR") + "원";
}

function getValue(id) {
  return document.getElementById(id).value;
}

function isChecked(id) {
  return document.getElementById(id).checked;
}

function parseMoney(id) {
  const rawValue = document.getElementById(id).value;
  return Number(rawValue.replace(/,/g, ""));
}

function addComma(value) {
  const numberOnly = String(value).replace(/[^\d]/g, "");
  if (!numberOnly) return "";
  return Number(numberOnly).toLocaleString("ko-KR");
}

const STORAGE_KEY = "ips_asset_inputs";
let latestStockRecommendationContext = null;

document.addEventListener("DOMContentLoaded", function () {
  loadAssetInputs({ silent: true });

  const moneyInputs = document.querySelectorAll(".money-input");

  moneyInputs.forEach(input => {
    input.value = addComma(input.value);

    input.addEventListener("input", function () {
      const cursorPosition = input.selectionStart;
      const beforeLength = input.value.length;

      input.value = addComma(input.value);

      const afterLength = input.value.length;
      const newPosition = cursorPosition + (afterLength - beforeLength);

      input.setSelectionRange(newPosition, newPosition);
    });
  });
});

function getAssetInputElements() {
  return Array.from(document.querySelectorAll("input[id], select[id]"))
    .filter(element => element.type !== "button" && element.type !== "submit");
}

function saveAssetInputs() {
  const formData = {};

  getAssetInputElements().forEach(element => {
    formData[element.id] = element.type === "checkbox"
      ? element.checked
      : element.value;
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  showPortfolioSaveToast("저장되었습니다");

  const button = document.getElementById("saveInputsBtn");
  const originalText = button.textContent;
  button.textContent = "저장되었습니다";
  button.disabled = true;

  window.setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 1200);
}

function loadAssetInputs(options = {}) {
  const savedRaw = localStorage.getItem(STORAGE_KEY);

  if (!savedRaw) {
    if (!options.silent) showPortfolioSaveToast("저장된 데이터가 없습니다");
    return false;
  }

  try {
    const formData = JSON.parse(savedRaw);

    getAssetInputElements().forEach(element => {
      if (!Object.prototype.hasOwnProperty.call(formData, element.id)) return;

      if (element.type === "checkbox") {
        element.checked = Boolean(formData[element.id]);
        return;
      }

      element.value = String(formData[element.id] ?? "");
    });

    if (!options.silent) showPortfolioSaveToast("불러왔습니다");
    return true;
  } catch (error) {
    console.warn("저장된 입력값을 불러오지 못했습니다.", error);
    if (!options.silent) showPortfolioSaveToast("저장된 데이터가 없습니다");
    return false;
  }
}

function savePortfolioInputs() {
  saveAssetInputs();
}

function restorePortfolioInputs() {
  return loadAssetInputs({ silent: true });
}

function showPortfolioSaveToast(message) {
  let toast = document.getElementById("portfolioSaveToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "portfolioSaveToast";
    toast.className = "portfolio-save-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  window.clearTimeout(showPortfolioSaveToast.timeoutId);
  showPortfolioSaveToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1600);
}

const PORTFOLIO_AI_ENDPOINT = "";
// 실제 운영 시에는 브라우저에 OpenAI API Key를 직접 넣지 말고,
// Firebase Functions / Cloudflare Workers 같은 서버 API 주소를 위 상수에 연결하세요.

async function generateIPS() {
  const button = document.getElementById("generateBtn");
  const originalButtonText = button.textContent;
  button.disabled = true;
  button.textContent = "AI 모델 분석 중...";

  try {
    const input = collectUserInputs();

    if (input.cashIncludesInvestable && input.cashAsset < input.investAmount) {
      alert("가용 투자자금 포함 여부를 체크한 경우, 현금성 자산은 가용 투자자금보다 크거나 같아야 합니다.\n\n현금성 자산 금액을 늘리거나, 가용 투자자금 포함 체크를 해제해 주세요.");
      return;
    }

    const diagnosis = calculateAssetDiagnosis(input);
    const modelResult = await runPortfolioAIModel(input, diagnosis);
    const allocation = modelResult.allocation;
    const reasons = modelResult.reasons;
    const aiNarrative = modelResult.narrative;

    const cashBaseAmount = input.investAmount;
    const cashBasedAmounts = {
      cash: calculateAmount(cashBaseAmount, allocation.cash),
      bond: calculateAmount(cashBaseAmount, allocation.bond),
      domesticStock: calculateAmount(cashBaseAmount, allocation.domesticStock),
      globalStock: calculateAmount(cashBaseAmount, allocation.globalStock),
      alternative: calculateAmount(cashBaseAmount, allocation.alternative)
    };
    cashBasedAmounts.cash += cashBaseAmount - Object.values(cashBasedAmounts).reduce((a, b) => a + b, 0);

    const nonInvestableCashAsset = input.cashIncludesInvestable
      ? Math.max(input.cashAsset - cashBaseAmount, 0)
      : input.cashAsset;

    const totalBasedAmounts = {
      cash: nonInvestableCashAsset + cashBasedAmounts.cash,
      deposit: cashBasedAmounts.bond,
      bond: input.bondAsset,
      domesticStock: input.stockAsset + cashBasedAmounts.domesticStock,
      globalStock: cashBasedAmounts.globalStock,
      alternative: input.otherAsset + input.pensionAsset + input.movableAsset + input.physicalAsset + cashBasedAmounts.alternative,
      realEstate: input.realEstateAsset
    };

    const totalBaseAmount = Object.values(totalBasedAmounts).reduce((a, b) => a + b, 0);
    const idealAllocation = buildIdealAssetAllocation(input, diagnosis, allocation);
    const idealBaseAmount = input.cashIncludesInvestable ? diagnosis.grossAsset : diagnosis.grossAsset + input.investAmount;

    renderProfile(input);
    renderDiagnosis(input, diagnosis);
    renderAllocation(input, allocation, cashBasedAmounts, totalBasedAmounts, totalBaseAmount, cashBaseAmount);
    renderIdealAllocation(input, idealAllocation, idealBaseAmount);
    renderAIModelResult(aiNarrative, modelResult.modelName);
    renderReasons(reasons);
    renderIPSReport(input, diagnosis, allocation, cashBasedAmounts, totalBasedAmounts, totalBaseAmount, aiNarrative, idealAllocation, idealBaseAmount);

    document.getElementById("resultSection").style.display = "block";
    document.getElementById("resultSection").scrollIntoView({ behavior: "smooth" });
  } finally {
    button.disabled = false;
    button.textContent = originalButtonText;
  }
}

function collectUserInputs() {
  const targetPeriodRaw = getValue("targetPeriod");

  return {
    ageGroup: getValue("ageGroup"),
    horizon: getValue("horizon"),
    risk: getValue("risk"),
    goal: getValue("goal"),
    targetPeriodRaw,
    targetPeriod: targetPeriodRaw ? Number(targetPeriodRaw) : null,
    investAmount: parseMoney("investAmount"),
    monthlySaving: parseMoney("monthlySaving"),
    targetAmount: parseMoney("targetAmount"),
    purposePhilosophy: getValue("purposePhilosophy"),
    strategyPhilosophy: getValue("strategyPhilosophy"),
    riskPhilosophy: getValue("riskPhilosophy"),
    marketBelief: getValue("marketBelief"),
    behaviorRule: getValue("behaviorRule"),
    cashAsset: parseMoney("cashAsset"),
    stockAsset: parseMoney("stockAsset"),
    bondAsset: parseMoney("bondAsset"),
    realEstateAsset: parseMoney("realEstateAsset"),
    debt: parseMoney("debt"),
    otherAsset: parseMoney("otherAsset"),
    pensionAsset: parseMoney("pensionAsset"),
    movableAsset: parseMoney("movableAsset"),
    physicalAsset: parseMoney("physicalAsset"),
    cashIncludesInvestable: isChecked("cashIncludesInvestable"),
    nearHousePurchase: isChecked("nearHousePurchase"),
    highRealEstate: isChecked("highRealEstate"),
    needEmergency: isChecked("needEmergency"),
    loanBurden: isChecked("loanBurden"),
    childPlan: isChecked("childPlan"),
    jobUnstable: isChecked("jobUnstable"),
    shortInvestmentPeriod: isChecked("shortInvestmentPeriod")
  };
}

function calculateAssetDiagnosis(input) {
  const grossAsset = input.cashAsset + input.stockAsset + input.bondAsset + input.realEstateAsset + input.otherAsset + input.pensionAsset + input.movableAsset + input.physicalAsset;
  const calculatedNetWorth = grossAsset - input.debt;
  const realEstateRatio = grossAsset > 0 ? input.realEstateAsset / grossAsset : 0;
  const cashRatio = grossAsset > 0 ? input.cashAsset / grossAsset : 0;
  const stockRatio = grossAsset > 0 ? input.stockAsset / grossAsset : 0;
  const debtRatio = grossAsset > 0 ? input.debt / grossAsset : 0;
  const investableRatio = calculatedNetWorth > 0 ? input.investAmount / calculatedNetWorth : 0;

  return { grossAsset, calculatedNetWorth, realEstateRatio, cashRatio, stockRatio, debtRatio, investableRatio };
}

async function runPortfolioAIModel(input, diagnosis) {
  const localModelResult = runLocalPortfolioAIModel(input, diagnosis);

  if (!PORTFOLIO_AI_ENDPOINT) {
    return localModelResult;
  }

  try {
    const response = await fetch(PORTFOLIO_AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, diagnosis, localModelResult })
    });

    if (!response.ok) throw new Error("AI endpoint error");
    const data = await response.json();

    if (data && data.allocation) {
      const allocation = {
        cash: Number(data.allocation.cash ?? localModelResult.allocation.cash),
        bond: Number(data.allocation.bond ?? localModelResult.allocation.bond),
        domesticStock: Number(data.allocation.domesticStock ?? localModelResult.allocation.domesticStock),
        globalStock: Number(data.allocation.globalStock ?? localModelResult.allocation.globalStock),
        alternative: Number(data.allocation.alternative ?? localModelResult.allocation.alternative)
      };
      normalizeAllocation(allocation);

      return {
        modelName: data.modelName || "외부 AI 모델",
        allocation,
        reasons: Array.isArray(data.reasons) ? data.reasons : localModelResult.reasons,
        narrative: data.narrative || localModelResult.narrative
      };
    }
  } catch (error) {
    console.warn("외부 AI 모델 호출 실패. 내장 AI 분석 모델로 대체합니다.", error);
  }

  return localModelResult;
}

function runLocalPortfolioAIModel(input, diagnosis) {
  let allocation = {
    cash: 20,
    bond: 20,
    domesticStock: 15,
    globalStock: 35,
    alternative: 10
  };

  let reasons = [];
  let riskTags = [];
  let actionItems = [];
  let liquidityScore = 50;
  let growthScore = 50;
  let stabilityScore = 50;

  if (input.risk === "low") {
    allocation.cash += 10;
    allocation.bond += 10;
    allocation.globalStock -= 15;
    allocation.domesticStock -= 5;
    liquidityScore += 10;
    stabilityScore += 15;
    growthScore -= 15;
    reasons.push("위험 감내도가 낮으므로 현금성과 채권 비중을 높였습니다.");
  }

  if (input.risk === "high") {
    allocation.globalStock += 15;
    allocation.domesticStock += 5;
    allocation.cash -= 10;
    allocation.bond -= 10;
    growthScore += 20;
    stabilityScore -= 10;
    reasons.push("위험 감내도가 높으므로 장기 기대수익률이 높은 주식 비중을 확대했습니다.");
  }

  if (input.horizon === "short" || (input.targetPeriod !== null && input.targetPeriod <= 3) || input.nearHousePurchase || input.shortInvestmentPeriod) {
    allocation.cash += 20;
    allocation.bond += 10;
    allocation.globalStock -= 20;
    allocation.domesticStock -= 10;
    liquidityScore += 25;
    stabilityScore += 15;
    growthScore -= 20;
    riskTags.push("단기 유동성 제약");
    actionItems.push("목표자금 사용 시점 전까지 위험자산 비중을 제한하고, 현금·예적금·단기채 중심으로 보유하세요.");
    reasons.push("투자 가능기간이 짧거나 단기 큰 자금 사용 가능성이 있으므로 현금성과 단기 안정자산 비중을 높였습니다.");
  }

  if (input.horizon === "long") {
    allocation.globalStock += 10;
    allocation.cash -= 5;
    allocation.bond -= 5;
    growthScore += 15;
    reasons.push("투자기간이 길기 때문에 위험자산을 장기적으로 보유할 여력이 있습니다.");
  }

  if (input.highRealEstate || diagnosis.realEstateRatio > 0.5) {
    allocation.globalStock += 10;
    allocation.domesticStock -= 5;
    allocation.alternative -= 5;
    riskTags.push("부동산 집중 리스크");
    actionItems.push("신규 투자금은 기존 부동산과 상관관계가 낮은 글로벌 금융자산 중심으로 분산하세요.");
    reasons.push("현재 부동산 비중이 높으므로 추가 투자금은 부동산과 상관관계가 낮은 글로벌 금융자산 중심으로 배분했습니다.");
  }

  if (input.needEmergency) {
    allocation.cash += 15;
    allocation.globalStock -= 10;
    allocation.domesticStock -= 5;
    liquidityScore += 20;
    riskTags.push("비상자금 부족");
    actionItems.push("투자 실행 전 생활비 6~12개월 수준의 비상자금을 별도 계정에 확보하세요.");
    reasons.push("비상자금 확보가 부족하므로 투자 전 현금성 자산을 우선 확보하도록 반영했습니다.");
  }

  if (input.loanBurden) {
    allocation.cash += 5;
    allocation.bond += 5;
    allocation.globalStock -= 10;
    stabilityScore += 10;
    riskTags.push("부채 상환 부담");
    actionItems.push("투자수익률 기대치와 대출금리를 비교해 일부 부채 상환도 대안으로 검토하세요.");
    reasons.push("부채 부담이 있으므로 유동성 및 안정성을 우선했습니다.");
  }

  if (input.jobUnstable) {
    allocation.cash += 10;
    allocation.bond += 5;
    allocation.globalStock -= 10;
    allocation.domesticStock -= 5;
    liquidityScore += 20;
    riskTags.push("소득 안정성 리스크");
    actionItems.push("직업 안정성이 낮은 경우 투자금과 별도로 방어적 현금 버퍼를 우선 구축하세요.");
    reasons.push("직업 안정성이 낮은 경우 소득 충격에 대비하기 위해 현금성과 안정자산 비중을 높였습니다.");
  }

  if (input.childPlan) {
    allocation.cash += 5;
    allocation.bond += 5;
    allocation.globalStock -= 5;
    allocation.domesticStock -= 5;
    riskTags.push("가족 생애주기 지출 증가 가능성");
    actionItems.push("자녀계획·교육자금은 목표시점별로 별도 버킷을 만들어 투자위험을 낮추세요.");
    reasons.push("자녀계획 또는 교육자금 수요를 고려해 목표자금의 안정성을 높였습니다.");
  }

  if (input.riskPhilosophy === "cash") {
    allocation.cash += 10;
    allocation.globalStock -= 5;
    allocation.domesticStock -= 5;
    liquidityScore += 15;
    reasons.push("언제든 쓸 현금을 충분히 두고 싶다는 성향을 반영해 현금성 자산의 전략적 비중을 높였습니다.");
  }

  if (input.riskPhilosophy === "diversification") {
    allocation.globalStock += 5;
    allocation.domesticStock -= 5;
    reasons.push("한곳에 몰지 않고 넓게 나누려는 성향을 반영해 해외자산 비중을 확대했습니다.");
  }

  if (input.riskPhilosophy === "loss" || input.riskPhilosophy === "noDebt") {
    allocation.cash += 5;
    allocation.bond += 10;
    allocation.globalStock -= 10;
    allocation.domesticStock -= 5;
    stabilityScore += 15;
    reasons.push("손실 가능성을 줄이고 빚 없이 안정적으로 투자하려는 성향을 반영해 안정자산 비중을 높였습니다.");
  }

  if (input.riskPhilosophy === "leverage") {
    allocation.globalStock += 5;
    allocation.cash -= 5;
    growthScore += 5;
    reasons.push("대출이나 빚도 일부 활용할 수 있다는 성향을 반영하되, 가계 포트폴리오 특성상 과도한 위험 확대는 제한했습니다.");
  }

  if (input.marketBelief === "longTerm") {
    allocation.globalStock += 10;
    allocation.cash -= 5;
    allocation.bond -= 5;
    growthScore += 10;
    reasons.push("장기 우상향 시장관을 반영하여 글로벌 주식 비중을 높였습니다.");
  }

  if (input.marketBelief === "crisis") {
    allocation.cash += 5;
    allocation.bond -= 5;
    liquidityScore += 5;
    reasons.push("위기 시 기회 활용을 위해 일정 수준의 대기성 현금을 유지하도록 했습니다.");
  }

  if (input.marketBelief === "timing" || input.strategyPhilosophy === "macro") {
    allocation.cash += 5;
    allocation.globalStock -= 5;
    reasons.push("시장 타이밍 또는 매크로 대응 선호를 반영해 전술적 대기자금 비중을 일부 확보했습니다.");
  }

  if (input.strategyPhilosophy === "passive" || input.strategyPhilosophy === "allocation") {
    actionItems.push("개별 종목보다 저비용 ETF와 정기 리밸런싱 중심으로 실행하는 것이 철학과 일치합니다.");
  }

  if (input.goal === "house") {
    allocation.cash += 10;
    allocation.bond += 5;
    allocation.globalStock -= 10;
    allocation.domesticStock -= 5;
    liquidityScore += 10;
    riskTags.push("주택 목표자금 보전 필요");
    actionItems.push("주택 목표자금은 투자 포트폴리오와 분리해 손실 가능성을 제한하세요.");
    reasons.push("주택 매수 또는 상급지 이동 목표가 있으므로 목표자금 훼손 가능성을 낮췄습니다.");
  }

  if (input.goal === "growth") {
    allocation.globalStock += 10;
    allocation.cash -= 5;
    allocation.bond -= 5;
    growthScore += 10;
    reasons.push("장기 자산 증식 목표를 반영하여 성장자산 비중을 높였습니다.");
  }

  if (input.goal === "retirement") {
    allocation.globalStock += 5;
    allocation.bond += 5;
    allocation.cash -= 5;
    allocation.domesticStock -= 5;
    reasons.push("은퇴 준비 목표를 반영해 성장성과 안정성을 함께 고려했습니다.");
  }

  if (input.goal === "cashflow") {
    allocation.bond += 10;
    allocation.cash += 5;
    allocation.globalStock -= 10;
    allocation.domesticStock -= 5;
    reasons.push("현금흐름 확보 목표를 반영해 이자성·안정성 자산 비중을 높였습니다.");
  }

  if (diagnosis.debtRatio > 0.35) {
    allocation.cash += 5;
    allocation.bond += 5;
    allocation.globalStock -= 10;
    riskTags.push("부채비율 관리 필요");
    reasons.push("부채비율이 높은 편이므로 변동성 자산 비중을 일부 낮췄습니다.");
  }

  normalizeAllocation(allocation);

  const dominantStyle = allocation.cash + allocation.bond >= 65
    ? "방어형 IPS"
    : allocation.globalStock + allocation.domesticStock >= 55
      ? "성장형 IPS"
      : "균형형 IPS";

  if (!riskTags.length) riskTags.push("특정 고위험 제약조건은 제한적");
  if (!actionItems.length) {
    actionItems.push("분기 또는 반기 단위로 목표비중 대비 ±5%p 이탈 여부를 점검하세요.");
    actionItems.push("가용 투자자금과 단기 목표자금을 구분해 관리하세요.");
  }

  const narrative = {
    dominantStyle,
    scores: {
      liquidity: Math.max(0, Math.min(100, liquidityScore)),
      growth: Math.max(0, Math.min(100, growthScore)),
      stability: Math.max(0, Math.min(100, stabilityScore))
    },
    riskTags,
    strategicView: buildStrategicViewText(input, diagnosis, allocation),
    keyRisks: buildKeyRiskText(input, diagnosis),
    actionItems,
    finalComment: buildFinalComment(input, allocation)
  };

  return {
    modelName: PORTFOLIO_AI_ENDPOINT ? "외부 AI 모델" : "내장 AI 분석 모델",
    allocation,
    reasons,
    narrative
  };
}

function buildStrategicViewText(input, diagnosis, allocation) {
  const growthWeight = allocation.domesticStock + allocation.globalStock;
  const safetyWeight = allocation.cash + allocation.bond;
  return `입력값을 종합하면 신규 투자금은 성장자산 ${growthWeight}%와 안정·유동성 자산 ${safetyWeight}%의 조합이 적절합니다. 현재 부동산 비중은 ${(diagnosis.realEstateRatio * 100).toFixed(1)}%이며, 이는 신규 자금 배분에서 부동산과 상관관계가 낮은 금융자산 분산 필요성을 높입니다.`;
}

function buildKeyRiskText(input, diagnosis) {
  const risks = [];
  if (diagnosis.realEstateRatio > 0.5 || input.highRealEstate) risks.push("부동산 집중도");
  if (input.nearHousePurchase || input.shortInvestmentPeriod || (input.targetPeriod !== null && input.targetPeriod <= 3)) risks.push("단기 목표자금 훼손 가능성");
  if (input.jobUnstable) risks.push("소득 안정성 저하");
  if (input.loanBurden || diagnosis.debtRatio > 0.35) risks.push("부채 부담");
  if (!risks.length) risks.push("정기 리밸런싱 미이행");
  return `핵심 리스크는 ${risks.join(", ")}입니다. 따라서 기대수익률만 보지 말고 목표시점, 현금흐름 안정성, 손실 발생 시 대응 여력을 함께 관리해야 합니다.`;
}

function buildFinalComment(input, allocation) {
  if (allocation.cash + allocation.bond >= 65) {
    return "현재 입력값 기준으로는 공격적인 수익률 추구보다 목표자금 보전과 유동성 관리가 우선입니다.";
  }
  if (allocation.domesticStock + allocation.globalStock >= 55) {
    return "장기투자 성격이 강하므로 단기 변동성을 감내하되, 리밸런싱 원칙을 사전에 고정하는 것이 중요합니다.";
  }
  return "현재 입력값 기준으로는 안정성과 성장성을 절충한 균형형 배분이 적합합니다.";
}

function renderProfile(input) {
  const profileHtml = `
    <span class="profile-badge">${translateAge(input.ageGroup)}</span>
    <span class="profile-badge">${translateHorizon(input.horizon)}</span>
    <span class="profile-badge">${translateRisk(input.risk)}</span>
    <span class="profile-badge">${translateGoal(input.goal)}</span>
    <span class="profile-badge">${translatePurpose(input.purposePhilosophy)}</span>
    <span class="profile-badge">${translateStrategy(input.strategyPhilosophy)}</span>
    <span class="profile-badge">${translateRiskPhilosophy(input.riskPhilosophy)}</span>
    <span class="profile-badge">${translateMarketBelief(input.marketBelief)}</span>
    <span class="profile-badge">${translateBehavior(input.behaviorRule)}</span>
  `;
  document.getElementById("profileBadges").innerHTML = profileHtml;
}

function renderDiagnosis(input, diagnosis) {
  document.getElementById("assetDiagnosis").innerHTML = `
    <p><strong>현재 입력 총자산:</strong> ${formatKRW(diagnosis.grossAsset)}</p>
    <p><strong>부채:</strong> ${formatKRW(input.debt)}</p>
    <p><strong>순자산:</strong> ${formatKRW(diagnosis.calculatedNetWorth)}</p>
    <p><strong>가용 투자자금:</strong> ${formatKRW(input.investAmount)}</p>
    <p><strong>현금성 자산 내 가용 투자자금 포함 여부:</strong> ${input.cashIncludesInvestable ? "포함" : "미포함"}</p>
    <p><strong>부동산 비중:</strong> ${(diagnosis.realEstateRatio * 100).toFixed(1)}%</p>
    <p><strong>현금성 자산 비중:</strong> ${(diagnosis.cashRatio * 100).toFixed(1)}%</p>
    <p><strong>주식 비중:</strong> ${(diagnosis.stockRatio * 100).toFixed(1)}%</p>
    ${diagnosis.realEstateRatio > 0.6 ? '<div class="warning">부동산 비중이 매우 높습니다. 추가 투자금은 금융자산 및 해외자산 중심의 분산이 필요합니다.</div>' : ''}
    ${diagnosis.cashRatio < 0.05 ? '<div class="warning">현금성 자산 비중이 낮습니다. 비상자금 확보가 우선입니다.</div>' : ''}
  `;
}

function renderAllocation(input, allocation, cashBasedAmounts, totalBasedAmounts, totalBaseAmount, cashBaseAmount) {
  latestStockRecommendationContext = {
    input,
    allocation,
    cashBasedAmounts,
    totalBasedAmounts,
    totalBaseAmount,
    cashBaseAmount
  };

  const totalBasedRows = [
    { label: "현금/MMF", amount: totalBasedAmounts.cash, className: "cash" },
    { label: "예적금", amount: totalBasedAmounts.deposit, className: "deposit" },
    { label: "채권", amount: totalBasedAmounts.bond, className: "bond" },
    { label: "국내주식/기존 주식", amount: totalBasedAmounts.domesticStock, className: "domestic" },
    { label: "해외주식", amount: totalBasedAmounts.globalStock, className: "global" },
    { label: "금/대체자산/기타", amount: totalBasedAmounts.alternative, className: "alt" },
    { label: "부동산", amount: totalBasedAmounts.realEstate, className: "realestate" }
  ];

  const cashBasedRows = [
    { label: "현금", amount: cashBasedAmounts.cash, className: "cash" },
    { label: "예적금", amount: cashBasedAmounts.bond, className: "bond" },
    { label: "국내주식", amount: cashBasedAmounts.domesticStock, className: "domestic", recommendationMarket: "KR" },
    { label: "해외주식", amount: cashBasedAmounts.globalStock, className: "global", recommendationMarket: "US" },
    { label: "금/대체자산/기타", amount: cashBasedAmounts.alternative, className: "alt" }
  ];

  document.getElementById("allocationResult").innerHTML = `
    <div class="allocation-grid">
      <div class="allocation-panel total-allocation-panel">
        <h4>총자산 기준 배분</h4>
        <p class="allocation-note">
          현재 보유자산에 가용 투자자금까지 반영한 총 금액 기준 배분입니다.
          현금성 자산의 가용 투자자금 포함 여부에 따라 중복 계산을 조정합니다.
        </p>
        ${createAllocationRowsFromAmounts(totalBasedRows, totalBaseAmount)}
      </div>

      <div class="allocation-panel cash-allocation-panel">
        <h4>가용 투자자금 기준 배분</h4>
        <p class="allocation-note">
          입력한 가용 투자자금 ${formatKRW(cashBaseAmount)}만을 기준으로 한 신규 투자 배분안입니다.
          기존 보유자산과 무관하게 순수 가용 투자자금만 배분합니다.
        </p>
        ${createAllocationRowsFromAmounts(cashBasedRows, cashBaseAmount)}
      </div>
    </div>
  `;
}

function buildIdealAssetAllocation(input, diagnosis, tacticalAllocation) {
  const ideal = {
    cash: 8,
    deposit: 12,
    bond: 10,
    domesticStock: 12,
    globalStock: 28,
    alternative: 5,
    realEstate: 25
  };

  if (input.goal === "house" || input.nearHousePurchase || input.shortInvestmentPeriod || (input.targetPeriod !== null && input.targetPeriod <= 3)) {
    ideal.cash += 7;
    ideal.deposit += 8;
    ideal.domesticStock -= 4;
    ideal.globalStock -= 8;
    ideal.alternative -= 3;
  }

  if (input.risk === "low" || input.riskPhilosophy === "loss" || input.riskPhilosophy === "noDebt") {
    ideal.deposit += 5;
    ideal.bond += 5;
    ideal.domesticStock -= 3;
    ideal.globalStock -= 7;
  }

  if (input.risk === "high" && input.horizon === "long") {
    ideal.domesticStock += 4;
    ideal.globalStock += 8;
    ideal.cash -= 4;
    ideal.deposit -= 4;
    ideal.bond -= 4;
  }

  if (input.highRealEstate || diagnosis.realEstateRatio > 0.5) {
    const targetRealEstate = input.goal === "house" ? 50 : 40;
    const releasedWeight = Math.max(0, ideal.realEstate - targetRealEstate);
    ideal.realEstate = Math.min(ideal.realEstate, targetRealEstate);
    ideal.globalStock += Math.round(releasedWeight * 0.4);
    ideal.deposit += Math.round(releasedWeight * 0.3);
    ideal.bond += Math.round(releasedWeight * 0.2);
    ideal.cash += releasedWeight - Math.round(releasedWeight * 0.4) - Math.round(releasedWeight * 0.3) - Math.round(releasedWeight * 0.2);
  }

  if (input.needEmergency || input.jobUnstable) {
    ideal.cash += 5;
    ideal.deposit += 5;
    ideal.domesticStock -= 3;
    ideal.globalStock -= 7;
  }

  if (input.marketBelief === "longTerm" && input.horizon === "long") {
    ideal.globalStock += 5;
    ideal.cash -= 2;
    ideal.deposit -= 3;
  }

  normalizeIdealAllocation(ideal);
  return ideal;
}

function normalizeIdealAllocation(ideal) {
  for (const key in ideal) {
    if (ideal[key] < 0) ideal[key] = 0;
  }

  const total = Object.values(ideal).reduce((a, b) => a + b, 0);
  for (const key in ideal) {
    ideal[key] = Math.round((ideal[key] / total) * 100);
  }

  const adjustedTotal = Object.values(ideal).reduce((a, b) => a + b, 0);
  ideal.cash += 100 - adjustedTotal;
}

function renderIdealAllocation(input, idealAllocation, idealBaseAmount) {
  const rows = [
    { label: "현금/MMF", percent: idealAllocation.cash, className: "cash" },
    { label: "예적금", percent: idealAllocation.deposit, className: "deposit" },
    { label: "채권", percent: idealAllocation.bond, className: "bond" },
    { label: "국내주식", percent: idealAllocation.domesticStock, className: "domestic" },
    { label: "해외주식", percent: idealAllocation.globalStock, className: "global" },
    { label: "금/대체자산/기타", percent: idealAllocation.alternative, className: "alt" },
    { label: "부동산", percent: idealAllocation.realEstate, className: "realestate" }
  ];

  document.getElementById("idealAllocationResult").innerHTML = `
    <div class="allocation-panel" style="max-width: 760px;">
      <h4>AI모델 기반 이상적 총자산 배분</h4>
      <p class="allocation-note">
        기본정보, 투자목표, 제약조건, 투자철학, 현재 자산구성을 모두 반영한 중장기 목표 배분입니다.
        현재 보유자산을 즉시 전부 매도하라는 뜻이 아니라, 향후 저축·투자·리밸런싱을 통해 접근할 기준점입니다.
      </p>
      ${rows.map(row => createAllocationBarWithAmount(
        row.label,
        row.percent,
        calculateAmount(idealBaseAmount, row.percent),
        row.className
      )).join("")}
    </div>
  `;
}

function renderAIModelResult(narrative, modelName) {
  document.getElementById("aiModelResult").innerHTML = `
    <div class="ai-status">${modelName} 분석 완료 · ${narrative.dominantStyle}</div>
    <div class="ai-chip-row">
      <span class="ai-chip">유동성 ${narrative.scores.liquidity}/100</span>
      <span class="ai-chip">성장성 ${narrative.scores.growth}/100</span>
      <span class="ai-chip">안정성 ${narrative.scores.stability}/100</span>
      ${narrative.riskTags.map(tag => `<span class="ai-chip">${tag}</span>`).join("")}
    </div>
    <div class="ai-insight-grid">
      <div class="ai-insight"><strong>전략 판단</strong>${narrative.strategicView}</div>
      <div class="ai-insight"><strong>핵심 리스크</strong>${narrative.keyRisks}</div>
    </div>
    <div class="ai-insight" style="margin-top:14px;">
      <strong>실행 액션</strong>
      <ul class="ai-action-list">
        ${narrative.actionItems.map(item => `<li>${item}</li>`).join("")}
      </ul>
    </div>
    <div class="ai-disclaimer">
      현재 HTML 단독 배포 환경에서는 API Key 노출을 피하기 위해 내장 AI 분석 모델을 우선 사용합니다.
      실제 OpenAI/Gemini 모델을 연결하려면 Firebase Functions 또는 Cloudflare Workers에 서버 API를 만들고 PORTFOLIO_AI_ENDPOINT에 연결하세요.
    </div>
  `;
}

function renderReasons(reasons) {
  document.getElementById("recommendReason").innerHTML = `
    <ul>
      ${reasons.length ? reasons.map(reason => `<li>${reason}</li>`).join("") : "<li>입력값이 부족해 기본 중립 배분안을 표시했습니다. 추가 정보를 입력하면 추천 사유가 더 구체화됩니다.</li>"}
    </ul>
  `;
}

function renderIPSReport(input, diagnosis, allocation, cashBasedAmounts, totalBasedAmounts, totalBaseAmount, aiNarrative, idealAllocation, idealBaseAmount) {
  const cashBaseAmount = input.investAmount;
  const ipsReport = `
[온라인 IPS 요약 보고서]

1. 투자목표
- 주요 목표: ${translateGoal(input.goal)}
- 목표 금액: ${formatKRW(input.targetAmount)}
- 현재 순자산: ${formatKRW(diagnosis.calculatedNetWorth)}
- 가용 투자자금: ${formatKRW(input.investAmount)}
- 월 저축 가능액: ${formatKRW(input.monthlySaving)}

2. 투자기간
- 투자 가능 기간: ${translateHorizon(input.horizon)}
- 목표 달성 시점: ${input.targetPeriod !== null ? input.targetPeriod + "년 이내" : "미입력"}

3. 투자자 위험성향
- 위험 감내도: ${translateRisk(input.risk)}
- 위험관리 철학: ${translateRiskPhilosophy(input.riskPhilosophy)}

4. 주요 제약조건
- 단기 목돈 사용 가능성: ${input.nearHousePurchase ? "있음" : "낮음"}
- 투자 가능기간 짧음: ${input.shortInvestmentPeriod ? "해당" : "해당 없음"}
- 직업 안정성 낮음: ${input.jobUnstable ? "해당" : "해당 없음"}
- 부동산 집중도: ${(diagnosis.realEstateRatio * 100).toFixed(1)}%
- 비상자금 부족 여부: ${input.needEmergency ? "있음" : "낮음"}
- 부채 부담 여부: ${input.loanBurden ? "있음" : "낮음"}

5. 투자철학
- 목적 철학: ${translatePurpose(input.purposePhilosophy)}
- 투자 방식: ${translateStrategy(input.strategyPhilosophy)}
- 시장관: ${translateMarketBelief(input.marketBelief)}
- 행동 원칙: ${translateBehavior(input.behaviorRule)}

6. AI 모델 분석 의견
- 분석 유형: ${aiNarrative.dominantStyle}
- 전략 판단: ${aiNarrative.strategicView}
- 핵심 리스크: ${aiNarrative.keyRisks}
- 종합 의견: ${aiNarrative.finalComment}

7. 전략적 자산배분

[가용 투자자금 기준]
- 기준 금액: ${formatKRW(cashBaseAmount)}
- 현금: ${allocation.cash}% / ${formatKRW(cashBasedAmounts.cash)}
- 예적금: ${allocation.bond}% / ${formatKRW(cashBasedAmounts.bond)}
- 국내주식: ${allocation.domesticStock}% / ${formatKRW(cashBasedAmounts.domesticStock)}
- 해외주식: ${allocation.globalStock}% / ${formatKRW(cashBasedAmounts.globalStock)}
- 금/대체자산/기타: ${allocation.alternative}% / ${formatKRW(cashBasedAmounts.alternative)}

[총자산 기준]
- 기준 금액: ${formatKRW(totalBaseAmount)}
- 현금/MMF: ${getRatioText(totalBasedAmounts.cash, totalBaseAmount)} / ${formatKRW(totalBasedAmounts.cash)}
- 예적금: ${getRatioText(totalBasedAmounts.deposit, totalBaseAmount)} / ${formatKRW(totalBasedAmounts.deposit)}
- 채권: ${getRatioText(totalBasedAmounts.bond, totalBaseAmount)} / ${formatKRW(totalBasedAmounts.bond)}
- 국내주식/기존 주식: ${getRatioText(totalBasedAmounts.domesticStock, totalBaseAmount)} / ${formatKRW(totalBasedAmounts.domesticStock)}
- 해외주식: ${getRatioText(totalBasedAmounts.globalStock, totalBaseAmount)} / ${formatKRW(totalBasedAmounts.globalStock)}
- 금/대체자산/기타: ${getRatioText(totalBasedAmounts.alternative, totalBaseAmount)} / ${formatKRW(totalBasedAmounts.alternative)}
- 부동산: ${getRatioText(totalBasedAmounts.realEstate, totalBaseAmount)} / ${formatKRW(totalBasedAmounts.realEstate)}

[이상적 자산배분]
- 기준 금액: ${formatKRW(idealBaseAmount)}
- 현금/MMF: ${idealAllocation.cash}% / ${formatKRW(calculateAmount(idealBaseAmount, idealAllocation.cash))}
- 예적금: ${idealAllocation.deposit}% / ${formatKRW(calculateAmount(idealBaseAmount, idealAllocation.deposit))}
- 채권: ${idealAllocation.bond}% / ${formatKRW(calculateAmount(idealBaseAmount, idealAllocation.bond))}
- 국내주식: ${idealAllocation.domesticStock}% / ${formatKRW(calculateAmount(idealBaseAmount, idealAllocation.domesticStock))}
- 해외주식: ${idealAllocation.globalStock}% / ${formatKRW(calculateAmount(idealBaseAmount, idealAllocation.globalStock))}
- 금/대체자산/기타: ${idealAllocation.alternative}% / ${formatKRW(calculateAmount(idealBaseAmount, idealAllocation.alternative))}
- 부동산: ${idealAllocation.realEstate}% / ${formatKRW(calculateAmount(idealBaseAmount, idealAllocation.realEstate))}

8. 리밸런싱 정책
- 정기 점검: 분기 또는 반기 1회
- 허용 밴드: 목표 비중 대비 ±5%p
- 원칙: 단기자금은 위험자산 투자 대상에서 제외
- 금지사항: 감정적 매도, 단기 급등 추격매수, 목표자금 훼손 가능성이 큰 집중투자

9. 실행 액션
${aiNarrative.actionItems.map((item, index) => `- ${index + 1}. ${item}`).join("\n")}
  `;

  document.getElementById("ipsReport").textContent = ipsReport;
}

function normalizeAllocation(allocation) {
  for (const key in allocation) {
    if (allocation[key] < 0) allocation[key] = 0;
  }

  const total = Object.values(allocation).reduce((a, b) => a + b, 0);

  for (const key in allocation) {
    allocation[key] = Math.round((allocation[key] / total) * 100);
  }

  let adjustedTotal = Object.values(allocation).reduce((a, b) => a + b, 0);
  allocation.cash += 100 - adjustedTotal;
}


function calculateAmount(baseAmount, percent) {
  return Math.round(baseAmount * percent / 100);
}

function getRatioText(amount, baseAmount) {
  if (!baseAmount || baseAmount <= 0) return "0.0%";
  return ((amount / baseAmount) * 100).toFixed(1) + "%";
}

function createAllocationRowsFromAmounts(rows, baseAmount) {
  return rows.map(row => {
    const ratio = baseAmount > 0 ? (row.amount / baseAmount) * 100 : 0;
    return createAllocationBarWithAmount(row.label, ratio, row.amount, row.className, row.rowClass, row.recommendationMarket);
  }).join("");
}

function createAllocationBarWithAmount(label, value, amount, className, rowClass = "", recommendationMarket = "") {
  const safeValue = Math.max(0, Math.min(value, 100));
  const recommendationButton = recommendationMarket
    ? `<button type="button" class="stock-recommendation-button" onclick="handleRecommendStocks('${recommendationMarket}')">종목 추천</button>`
    : "";
  const recommendationPanel = recommendationMarket
    ? `<div class="stock-recommendation-panel" data-recommendation-market="${recommendationMarket}" hidden></div>`
    : "";

  return `
    <div class="allocation-row ${rowClass}">
      <div class="allocation-label">
        <span class="allocation-title">${label}${recommendationButton}</span>
        <span>${value.toFixed(1)}% <span class="allocation-amount">(${formatKRW(amount)})</span></span>
      </div>
      <div class="bar">
        <div class="bar-fill ${className}" style="width:${safeValue}%"></div>
      </div>
      ${recommendationPanel}
    </div>
  `;
}

function handleRecommendStocks(market) {
  const panel = document.querySelector(`[data-recommendation-market="${market}"]`);
  if (!panel) return;

  const recommendations = buildStockRecommendationResult(market);
  panel.innerHTML = renderStockRecommendationPanel(recommendations);
  panel.hidden = false;

  const button = panel.closest(".allocation-row")?.querySelector(".stock-recommendation-button");
  if (button) {
    button.textContent = "다시 추천";
    button.setAttribute("aria-expanded", "true");
  }
}

function renderStockRecommendations(market) {
  return renderStockRecommendationPanel(buildStockRecommendationResult(market));
}

function renderStockRecommendationPanel(data) {
  return `
    <div class="stock-recommendation-grid">
      <div class="stock-recommendation-group">
        <h5>AI모델을 이용한 추천종목 5개</h5>
        <ol>
          ${data.aiModel.map(item => `<li><strong>${item.name}</strong><span>${item.reason}</span></li>`).join("")}
        </ol>
      </div>
      <div class="stock-recommendation-group">
        <h5>전문 투자자 및 애널리스트 추천종목 5개</h5>
        <ol>
          ${data.analystConsensus.map(item => `<li><strong>${item.name}</strong><span>${item.reason}</span></li>`).join("")}
        </ol>
      </div>
    </div>
    <p class="stock-recommendation-disclaimer">
      추천종목은 참고용 예시이며 매수·매도 권유가 아닙니다. 실제 투자 전 최신 실적, 밸류에이션, 리스크와 본인의 투자성향을 확인하세요.
    </p>
  `;
}

function buildStockRecommendationResult(market) {
  const investorProfile = getInvestorProfile();
  const universe = filterStockUniverseForProfile(getStockUniverse(market), investorProfile);
  const aiScoredStocks = universe.map(stock => ({
    ...stock,
    score: calculateStockScore(stock, investorProfile, "AI")
  }));
  const analystScoredStocks = universe.map(stock => ({
    ...stock,
    score: calculateStockScore(stock, investorProfile, "ANALYST")
  }));
  const aiStorageKey = `stock_recommendations_${market}_AI`;
  const analystStorageKey = `stock_recommendations_${market}_ANALYST`;
  const aiSelection = pickWeightedRandomStocks(aiScoredStocks, 5, sessionStorage.getItem(aiStorageKey));
  const analystSelection = pickWeightedRandomStocks(analystScoredStocks, 5, sessionStorage.getItem(analystStorageKey));

  sessionStorage.setItem(aiStorageKey, aiSelection.map(stock => stock.name).sort().join("|"));
  sessionStorage.setItem(analystStorageKey, analystSelection.map(stock => stock.name).sort().join("|"));

  return {
    aiModel: aiSelection.map(stock => ({
      name: stock.name,
      reason: buildStockRecommendationReason(stock, investorProfile, market, "AI")
    })),
    analystConsensus: analystSelection.map(stock => ({
      name: stock.name,
      reason: buildStockRecommendationReason(stock, investorProfile, market, "ANALYST")
    }))
  };
}

function getStockRecommendations(market) {
  return buildStockRecommendationResult(market);
}

function getInvestorProfile() {
  const input = latestStockRecommendationContext?.input || collectUserInputs();
  const diagnosis = calculateAssetDiagnosis(input);
  const allocation = latestStockRecommendationContext?.allocation || runLocalPortfolioAIModel(input, diagnosis).allocation;
  const age = Number(input.ageGroup) || 40;
  const currentStockRatio = diagnosis.grossAsset > 0 ? input.stockAsset / diagnosis.grossAsset : 0;
  const realEstateRatio = diagnosis.realEstateRatio || 0;
  const riskProfile = getRecommendationRiskProfile(input, age, currentStockRatio, realEstateRatio);

  return {
    input,
    diagnosis,
    allocation,
    age,
    riskProfile,
    currentStockRatio,
    realEstateRatio,
    domesticTargetWeight: allocation.domesticStock || 0,
    globalTargetWeight: allocation.globalStock || 0,
    preferredAssetWeight: (allocation.domesticStock || 0) + (allocation.globalStock || 0)
  };
}

function getRecommendationRiskProfile(input, age, currentStockRatio, realEstateRatio) {
  let score = 3;

  if (input.risk === "low") score -= 1.3;
  if (input.risk === "high") score += 1.3;
  if (input.horizon === "short" || input.shortInvestmentPeriod || input.nearHousePurchase) score -= 1;
  if (input.horizon === "long") score += 0.7;
  if (age >= 60) score -= 0.8;
  if (age <= 30) score += 0.5;
  if (input.goal === "preservation" || input.goal === "house" || input.goal === "cashflow") score -= 0.6;
  if (input.goal === "growth") score += 0.7;
  if (input.riskPhilosophy === "loss" || input.riskPhilosophy === "cash" || input.riskPhilosophy === "noDebt") score -= 0.7;
  if (input.riskPhilosophy === "leverage" || input.strategyPhilosophy === "growth") score += 0.7;
  if (currentStockRatio > 0.45) score -= 0.4;
  if (realEstateRatio > 0.55) score += 0.2;

  const clamped = Math.max(1, Math.min(5, score));
  if (clamped <= 1.7) return { tier: "stable", score: clamped, label: "안정형" };
  if (clamped <= 2.5) return { tier: "cautious", score: clamped, label: "안정추구형" };
  if (clamped <= 3.4) return { tier: "neutral", score: clamped, label: "위험중립형" };
  if (clamped <= 4.2) return { tier: "active", score: clamped, label: "적극투자형" };
  return { tier: "aggressive", score: clamped, label: "공격투자형" };
}

function getStockUniverse(market) {
  const universes = {
    KR: [
      { name: "삼성전자", sector: "반도체", style: "quality", riskLevel: 3, dividendScore: 3, growthScore: 4, volatilityScore: 3, analystScore: 5, qualityScore: 5 },
      { name: "SK하이닉스", sector: "반도체", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 5, volatilityScore: 4, analystScore: 5, qualityScore: 4 },
      { name: "현대차", sector: "자동차", style: "value", riskLevel: 3, dividendScore: 4, growthScore: 3, volatilityScore: 3, analystScore: 4, qualityScore: 4 },
      { name: "기아", sector: "자동차", style: "value", riskLevel: 3, dividendScore: 4, growthScore: 3, volatilityScore: 3, analystScore: 4, qualityScore: 4 },
      { name: "KB금융", sector: "금융", style: "dividend", riskLevel: 2, dividendScore: 5, growthScore: 2, volatilityScore: 2, analystScore: 4, qualityScore: 4 },
      { name: "신한지주", sector: "금융", style: "dividend", riskLevel: 2, dividendScore: 5, growthScore: 2, volatilityScore: 2, analystScore: 4, qualityScore: 4 },
      { name: "삼성바이오로직스", sector: "바이오", style: "quality", riskLevel: 3, dividendScore: 1, growthScore: 4, volatilityScore: 3, analystScore: 4, qualityScore: 5 },
      { name: "셀트리온", sector: "바이오", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 4, volatilityScore: 4, analystScore: 3, qualityScore: 3 },
      { name: "NAVER", sector: "플랫폼", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 4, volatilityScore: 4, analystScore: 3, qualityScore: 4 },
      { name: "카카오", sector: "플랫폼", style: "growth", riskLevel: 5, dividendScore: 1, growthScore: 4, volatilityScore: 5, analystScore: 2, qualityScore: 2 },
      { name: "LG에너지솔루션", sector: "2차전지", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 4, volatilityScore: 4, analystScore: 3, qualityScore: 3 },
      { name: "POSCO홀딩스", sector: "소재", style: "cyclical", riskLevel: 4, dividendScore: 3, growthScore: 3, volatilityScore: 4, analystScore: 3, qualityScore: 3 },
      { name: "한국전력", sector: "유틸리티", style: "defensive", riskLevel: 2, dividendScore: 2, growthScore: 2, volatilityScore: 2, analystScore: 3, qualityScore: 3 },
      { name: "KT&G", sector: "필수소비재", style: "defensive", riskLevel: 2, dividendScore: 5, growthScore: 2, volatilityScore: 2, analystScore: 4, qualityScore: 4 },
      { name: "TIGER 미국S&P500", sector: "ETF", style: "etf", riskLevel: 3, dividendScore: 2, growthScore: 3, volatilityScore: 3, analystScore: 4, qualityScore: 4 },
      { name: "KODEX 200", sector: "ETF", style: "etf", riskLevel: 3, dividendScore: 2, growthScore: 3, volatilityScore: 3, analystScore: 4, qualityScore: 4 },
      { name: "HD현대일렉트릭", sector: "전력기기", style: "growth", riskLevel: 4, dividendScore: 2, growthScore: 5, volatilityScore: 4, analystScore: 4, qualityScore: 3 },
      { name: "한화에어로스페이스", sector: "방산", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 5, volatilityScore: 4, analystScore: 4, qualityScore: 3 }
    ],
    US: [
      { name: "Microsoft", sector: "AI/클라우드", style: "quality", riskLevel: 3, dividendScore: 2, growthScore: 5, volatilityScore: 3, analystScore: 5, qualityScore: 5 },
      { name: "NVIDIA", sector: "AI 반도체", style: "growth", riskLevel: 5, dividendScore: 1, growthScore: 5, volatilityScore: 5, analystScore: 5, qualityScore: 4 },
      { name: "Alphabet", sector: "플랫폼", style: "quality", riskLevel: 3, dividendScore: 1, growthScore: 4, volatilityScore: 3, analystScore: 4, qualityScore: 5 },
      { name: "Amazon", sector: "클라우드/소비", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 5, volatilityScore: 4, analystScore: 4, qualityScore: 4 },
      { name: "Apple", sector: "빅테크", style: "quality", riskLevel: 3, dividendScore: 2, growthScore: 3, volatilityScore: 3, analystScore: 4, qualityScore: 5 },
      { name: "Meta Platforms", sector: "플랫폼", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 4, volatilityScore: 4, analystScore: 4, qualityScore: 4 },
      { name: "Broadcom", sector: "반도체", style: "quality", riskLevel: 4, dividendScore: 3, growthScore: 5, volatilityScore: 4, analystScore: 5, qualityScore: 4 },
      { name: "Eli Lilly", sector: "헬스케어", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 5, volatilityScore: 3, analystScore: 5, qualityScore: 4 },
      { name: "Johnson & Johnson", sector: "헬스케어", style: "defensive", riskLevel: 2, dividendScore: 5, growthScore: 2, volatilityScore: 2, analystScore: 3, qualityScore: 5 },
      { name: "Procter & Gamble", sector: "필수소비재", style: "defensive", riskLevel: 2, dividendScore: 4, growthScore: 2, volatilityScore: 2, analystScore: 3, qualityScore: 5 },
      { name: "Coca-Cola", sector: "필수소비재", style: "dividend", riskLevel: 2, dividendScore: 5, growthScore: 2, volatilityScore: 2, analystScore: 3, qualityScore: 4 },
      { name: "JPMorgan Chase", sector: "금융", style: "value", riskLevel: 3, dividendScore: 4, growthScore: 3, volatilityScore: 3, analystScore: 4, qualityScore: 4 },
      { name: "Berkshire Hathaway", sector: "복합지주", style: "quality", riskLevel: 2, dividendScore: 1, growthScore: 3, volatilityScore: 2, analystScore: 4, qualityScore: 5 },
      { name: "Vanguard S&P 500 ETF", sector: "ETF", style: "etf", riskLevel: 3, dividendScore: 3, growthScore: 3, volatilityScore: 3, analystScore: 4, qualityScore: 4 },
      { name: "Invesco QQQ ETF", sector: "ETF", style: "etf-growth", riskLevel: 4, dividendScore: 1, growthScore: 4, volatilityScore: 4, analystScore: 4, qualityScore: 4 },
      { name: "UnitedHealth Group", sector: "헬스케어", style: "quality", riskLevel: 3, dividendScore: 2, growthScore: 3, volatilityScore: 3, analystScore: 3, qualityScore: 4 },
      { name: "Visa", sector: "결제", style: "quality", riskLevel: 3, dividendScore: 2, growthScore: 4, volatilityScore: 3, analystScore: 4, qualityScore: 5 },
      { name: "ASML", sector: "반도체 장비", style: "growth", riskLevel: 4, dividendScore: 1, growthScore: 5, volatilityScore: 4, analystScore: 4, qualityScore: 4 }
    ]
  };

  return (universes[market] || universes.KR).map(stock => ({ ...stock, market }));
}

function filterStockUniverseForProfile(universe, investorProfile) {
  let filtered = universe;

  if (investorProfile.riskProfile.tier === "stable") {
    filtered = universe.filter(stock => stock.riskLevel <= 3 || stock.dividendScore >= 4 || stock.style.includes("etf"));
  } else if (investorProfile.riskProfile.tier === "cautious") {
    filtered = universe.filter(stock => stock.riskLevel <= 4 || stock.qualityScore >= 4 || stock.style.includes("etf"));
  } else if (investorProfile.riskProfile.tier === "neutral") {
    filtered = universe.filter(stock => stock.qualityScore >= 3 || stock.style.includes("etf"));
  } else {
    filtered = universe.filter(stock => stock.growthScore >= 3 || stock.analystScore >= 4 || stock.style.includes("etf"));
  }

  return filtered.length >= 8 ? filtered : universe;
}

function calculateStockScore(stock, investorProfile, recommendationType) {
  const weightsByTier = {
    stable: { dividend: 0.25, growth: 0.08, lowVolatility: 0.25, analyst: 0.12, quality: 0.18, riskFit: 0.12, etf: 0.05 },
    cautious: { dividend: 0.2, growth: 0.12, lowVolatility: 0.22, analyst: 0.13, quality: 0.17, riskFit: 0.14, etf: 0.07 },
    neutral: { dividend: 0.14, growth: 0.22, lowVolatility: 0.16, analyst: 0.14, quality: 0.14, riskFit: 0.14, etf: 0.1 },
    active: { dividend: 0.08, growth: 0.34, lowVolatility: 0.08, analyst: 0.14, quality: 0.12, riskFit: 0.18, etf: 0.08 },
    aggressive: { dividend: 0.04, growth: 0.42, lowVolatility: 0.04, analyst: 0.12, quality: 0.1, riskFit: 0.22, etf: 0.06 }
  };
  const tierWeights = weightsByTier[investorProfile.riskProfile.tier] || weightsByTier.neutral;
  const riskFit = 5 - Math.min(4, Math.abs(stock.riskLevel - investorProfile.riskProfile.score));
  const lowVolatility = 6 - stock.volatilityScore;
  const etfScore = stock.style.includes("etf") ? 5 : 0;
  const marketTargetWeight = stockMarketTargetWeight(stock, investorProfile);
  const sectorBonus = getPreferredSectorBonus(stock, investorProfile);
  const profileFitScore = (
    stock.dividendScore * tierWeights.dividend +
    stock.growthScore * tierWeights.growth +
    lowVolatility * tierWeights.lowVolatility +
    stock.analystScore * tierWeights.analyst +
    stock.qualityScore * tierWeights.quality +
    riskFit * tierWeights.riskFit +
    etfScore * tierWeights.etf
  ) * 20 + sectorBonus + marketTargetWeight;
  const analystFitScore = ((stock.analystScore * 0.45) + (stock.qualityScore * 0.35) + (riskFit * 0.2)) * 20;
  const randomDiversityScore = Math.random() * 100;
  const baseScore = recommendationType === "ANALYST"
    ? (analystFitScore * 0.55) + (profileFitScore * 0.45)
    : profileFitScore;

  return Math.max(1, (baseScore * 0.7) + (randomDiversityScore * 0.3));
}

function stockMarketTargetWeight(stock, investorProfile) {
  const targetWeight = stock.market === "KR"
    ? investorProfile.domesticTargetWeight
    : investorProfile.globalTargetWeight;
  return targetWeight >= 25 ? 6 : targetWeight >= 15 ? 3 : 0;
}

function getPreferredSectorBonus(stock, investorProfile) {
  let bonus = 0;
  const input = investorProfile.input;
  const growthSectors = ["반도체", "AI 반도체", "AI/클라우드", "클라우드/소비", "플랫폼", "바이오", "2차전지", "전력기기", "방산", "반도체 장비"];
  const defensiveSectors = ["금융", "필수소비재", "유틸리티", "헬스케어", "복합지주"];

  if ((input.goal === "growth" || input.horizon === "long") && growthSectors.includes(stock.sector)) bonus += 8;
  if ((input.goal === "cashflow" || input.risk === "low") && (stock.dividendScore >= 4 || defensiveSectors.includes(stock.sector))) bonus += 8;
  if (input.strategyPhilosophy === "passive" || input.strategyPhilosophy === "allocation") {
    if (stock.style.includes("etf")) bonus += 10;
  }
  if (investorProfile.realEstateRatio > 0.5 && stock.market === "US") bonus += 4;
  if (investorProfile.age >= 50 && stock.volatilityScore <= 3) bonus += 4;
  if (investorProfile.age <= 30 && stock.growthScore >= 4) bonus += 4;

  return bonus;
}

function pickWeightedRandomStocks(scoredStocks, count, previousRecommendation) {
  const sortedStocks = [...scoredStocks].sort((a, b) => b.score - a.score);
  const candidates = sortedStocks.slice(0, Math.max(count + 3, Math.ceil(sortedStocks.length * 0.75)));
  let selected = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    selected = weightedSampleWithoutReplacement(candidates, count);
    if (!isSameRecommendationSet(selected, previousRecommendation)) break;
  }

  return selected;
}

function weightedSampleWithoutReplacement(candidates, count) {
  const remaining = [...candidates];
  const selected = [];

  while (selected.length < count && remaining.length) {
    const totalWeight = remaining.reduce((sum, item) => sum + Math.max(item.score, 1), 0);
    let threshold = Math.random() * totalWeight;
    const index = remaining.findIndex(item => {
      threshold -= Math.max(item.score, 1);
      return threshold <= 0;
    });
    selected.push(...remaining.splice(index >= 0 ? index : remaining.length - 1, 1));
  }

  return selected;
}

function isSameRecommendationSet(selected, previousRecommendation) {
  if (!previousRecommendation) return false;
  return selected.map(item => item.name).sort().join("|") === previousRecommendation;
}

function buildStockRecommendationReason(stock, investorProfile, market, recommendationType) {
  const profile = investorProfile.riskProfile.label;
  const targetWeight = market === "KR" ? investorProfile.domesticTargetWeight : investorProfile.globalTargetWeight;
  const horizonText = translateHorizon(investorProfile.input.horizon);
  const modeText = recommendationType === "ANALYST"
    ? `애널리스트 선호도 ${stock.analystScore}/5와 우량도 ${stock.qualityScore}/5를 반영했습니다.`
    : `${profile} 성향, ${horizonText}, 목표비중 ${targetWeight}%를 반영했습니다.`;
  const styleText = stock.dividendScore >= 4
    ? "배당·방어 성격이 있어 변동성 완충에 유리합니다."
    : stock.growthScore >= 4
      ? `${stock.sector} 성장성과 산업 모멘텀을 기대할 수 있는 후보입니다.`
      : "우량주 성격과 분산 효과를 함께 고려한 후보입니다.";

  return `${modeText} ${styleText}`;
}

function createAllocationBar(label, value, className) {
  return `
    <div class="allocation-row">
      <div class="allocation-label">
        <span>${label}</span>
        <span>${value}%</span>
      </div>
      <div class="bar">
        <div class="bar-fill ${className}" style="width:${value}%"></div>
      </div>
    </div>
  `;
}

function translateAge(value) {
  return value ? value + "대" : "미입력";
}

function translateHorizon(value) {
  const map = {
    short: "단기 투자자",
    medium: "중기 투자자",
    long: "장기 투자자"
  };
  return map[value] || "미입력";
}

function translateRisk(value) {
  const map = {
    low: "안정형",
    medium: "중립형",
    high: "성장형"
  };
  return map[value] || "미입력";
}

function translateGoal(value) {
  const map = {
    house: "주택 매수/상급지 이동",
    growth: "장기 자산 증식",
    retirement: "은퇴 준비",
    cashflow: "현금흐름 확보",
    education: "자녀 교육자금",
    preservation: "자산 보존"
  };
  return map[value] || "미입력";
}

function translatePurpose(value) {
  const map = {
    growth: "돈을 불리고 싶어요",
    cashflow: "매달 들어오는 수입이 중요해요",
    preservation: "원금을 지키는 게 우선이에요",
    goal: "정해둔 목표금액을 모으고 싶어요",
    inflation: "물가가 올라도 돈의 가치를 지키고 싶어요"
  };
  return map[value] || "미입력";
}

function translateStrategy(value) {
  const map = {
    passive: "시장 전체에 나눠서 투자할래요",
    active: "좋아 보이는 종목을 직접 고를래요",
    value: "싸게 평가된 회사를 살래요",
    growth: "앞으로 크게 성장할 회사에 투자할래요",
    quant: "정해진 기준과 숫자로 투자할래요",
    allocation: "주식·채권·현금을 나눠서 투자할래요",
    macro: "금리·환율·경기 흐름을 보고 조절할래요"
  };
  return map[value] || "미입력";
}

function translateRiskPhilosophy(value) {
  const map = {
    volatility: "오르내림이 커도 버틸 수 있어요",
    loss: "손실 가능성을 최대한 줄이고 싶어요",
    cash: "언제든 쓸 현금을 충분히 두고 싶어요",
    diversification: "한곳에 몰지 않고 넓게 나눌래요",
    leverage: "대출이나 빚도 일부 활용할 수 있어요",
    noDebt: "빚 없이 안정적으로 투자할래요"
  };
  return map[value] || "미입력";
}

function translateMarketBelief(value) {
  const map = {
    efficient: "시장을 이기기보다 따라갈래요",
    cycle: "경기 흐름에 맞춰 바꿀래요",
    timing: "싸게 사고 비쌀 때 팔고 싶어요",
    longTerm: "장기적으로 시장은 오른다고 봐요",
    crisis: "하락장도 기회로 활용하고 싶어요"
  };
  return map[value] || "미입력";
}

function translateBehavior(value) {
  const map = {
    saving: "매달 꾸준히 투자할래요",
    rebalance: "정해진 비율로 주기적으로 맞출래요",
    hold: "오래 들고 갈래요",
    concentrated: "확신 있는 곳에 집중할래요",
    learning: "공부하면서 조금씩 늘려갈래요",
    simple: "복잡하지 않게 투자할래요"
  };
  return map[value] || "미입력";
}
