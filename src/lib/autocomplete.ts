/**
 * タイトル入力補完（vanilla 実装）
 * kongyo-spec の autocomplete パイプラインの設計（デバウンス・IME 対応・
 * 鮮度トークン・キーボード操作）を本ツール向けに移植したもの。
 *
 * 使い方: input を `.autocomplete-wrap`（position: relative）で包んでおく。
 */

export interface AutocompleteOptions {
    /** 候補の取得。AbortSignal で古いリクエストは中断される */
    fetcher: (query: string, signal: AbortSignal) => Promise<string[]>;
    /** 候補を確定したときのコールバック */
    onSelect?: (value: string) => void;
    minLength?: number;
    debounceMs?: number;
}

export interface AutocompleteHandle {
    destroy(): void;
    close(): void;
}

export function attachAutocomplete(
    input: HTMLInputElement,
    options: AutocompleteOptions
): AutocompleteHandle {
    const minLength = options.minLength ?? 1;
    const debounceMs = options.debounceMs ?? 250;

    const list = document.createElement("ul");
    list.className = "autocomplete-list hidden";
    list.setAttribute("role", "listbox");
    (input.parentElement ?? document.body).appendChild(list);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");

    let items: string[] = [];
    let activeIndex = -1;
    let composing = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let requestToken = 0;

    function close(): void {
        items = [];
        activeIndex = -1;
        list.classList.add("hidden");
        list.innerHTML = "";
    }

    function render(): void {
        list.innerHTML = "";
        if (items.length === 0) {
            close();
            return;
        }
        items.forEach((title, index) => {
            const li = document.createElement("li");
            li.className = "autocomplete-item" + (index === activeIndex ? " active" : "");
            li.setAttribute("role", "option");
            li.textContent = title;
            // blur より先に確定させるため pointerdown を使う
            li.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                select(index);
            });
            list.appendChild(li);
        });
        list.classList.remove("hidden");
    }

    function select(index: number): void {
        const value = items[index];
        if (value === undefined) return;
        input.value = value;
        close();
        input.dispatchEvent(new Event("change", { bubbles: true }));
        options.onSelect?.(value);
    }

    function scheduleFetch(): void {
        if (timer !== null) {
            window.clearTimeout(timer);
        }
        timer = window.setTimeout(runFetch, debounceMs);
    }

    async function runFetch(): Promise<void> {
        timer = null;
        const query = input.value.trim();
        if (composing || query.length < minLength) {
            close();
            return;
        }

        controller?.abort();
        controller = new AbortController();
        const token = ++requestToken;

        try {
            const results = await options.fetcher(query, controller.signal);
            // 入力が進んで古くなった応答は捨てる
            if (token !== requestToken || document.activeElement !== input) return;
            items = results.slice(0, 10);
            activeIndex = -1;
            render();
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            console.warn("補完候補の取得に失敗しました:", error);
            close();
        }
    }

    function onInput(): void {
        if (composing) return;
        scheduleFetch();
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (composing || items.length === 0) return;
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                activeIndex = (activeIndex + 1) % items.length;
                render();
                break;
            case "ArrowUp":
                event.preventDefault();
                activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
                render();
                break;
            case "Enter":
                if (activeIndex >= 0) {
                    event.preventDefault();
                    select(activeIndex);
                } else {
                    close();
                }
                break;
            case "Escape":
                event.preventDefault();
                close();
                break;
        }
    }

    function onCompositionStart(): void {
        composing = true;
    }

    function onCompositionEnd(): void {
        composing = false;
        scheduleFetch();
    }

    function onBlur(): void {
        // pointerdown 選択を潰さないよう1フレーム待つ
        window.setTimeout(close, 100);
    }

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("compositionstart", onCompositionStart);
    input.addEventListener("compositionend", onCompositionEnd);
    input.addEventListener("blur", onBlur);

    return {
        close,
        destroy(): void {
            if (timer !== null) window.clearTimeout(timer);
            controller?.abort();
            input.removeEventListener("input", onInput);
            input.removeEventListener("keydown", onKeyDown);
            input.removeEventListener("compositionstart", onCompositionStart);
            input.removeEventListener("compositionend", onCompositionEnd);
            input.removeEventListener("blur", onBlur);
            list.remove();
        },
    };
}
