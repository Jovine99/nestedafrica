
    !function() {
        "use strict";

        function debounce(func, delay) {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    func(...args);
                }, delay);
            };
        }

        class DOMContentLoadedManager {
            constructor() {
                this.callbacks = [];
                window.addEventListener("DOMContentLoaded", () => this.onDOMContentLoaded());
            }

            onDOMContentLoaded() {
                this.callbacks.sort((t, n) => t.priority - n.priority).forEach(({ callback: t }) => t());
            }

            runOnLoad(callback) {
                "loading" === document.readyState ? this.callbacks.push(callback) : callback.callback();
            }
        }

        function runOnLoad(callback, priority = Number.MAX_VALUE) {
            (window.canva_scriptExecutor = window.canva_scriptExecutor || new DOMContentLoadedManager())
                .runOnLoad({ callback, priority });
        }

        class ResizeManager {
            constructor(callback) {
                this.items = [];
                this.previousWidth = document.documentElement.clientWidth;
                this.previousHeight = window.innerHeight;
                const listener = debounce(() => this.onWindowResize(), 100);
                window.addEventListener("resize", listener);
            }

            onWindowResize() {
                const currentWidth = document.documentElement.clientWidth;
                const currentHeight = window.innerHeight;
                const widthChanged = this.previousWidth !== currentWidth;
                const heightChanged = this.previousHeight !== currentHeight;

                this.items.forEach(item => {
                    const executeCallback = () => {
                        item.callback();
                        item.executed = true;
                    };

                    if (!item.executed || (widthChanged && item.options.runOnWidthChange) || (heightChanged && item.options.runOnHeightChange)) {
                        executeCallback();
                    }
                });

                this.previousWidth = currentWidth;
                this.previousHeight = currentHeight;
            }

            runOnResize(callback, options) {
                this.items.push({ callback, options, executed: options.runOnLoad });
                this.items.sort((t, n) => t.options.priority - n.options.priority);
                options.runOnLoad && runOnLoad(callback, options.priority);
            }
        }

        function debounceResize(callback, options, debounceFunction = debounce) {
            (window.canva_debounceResize = window.canva_debounceResize || new ResizeManager(debounceFunction))
                .runOnResize(callback, { runOnLoad: false, runOnWidthChange: true, runOnHeightChange: false, priority: Number.MAX_VALUE, ...options });
        }

        const MIN_FONT_SIZE = "--minfs";
        const RESIZE_FACTOR = "--rzf";
        const RESIZE_FONT_SIZE_ON_WIDTH_CHANGE = "--rfso";
        const RESIZE_FONT_SIZE_ON_HEIGHT_CHANGE = "--bfso";

        function isApproximatelyEqual(value1, value2, epsilon = 0.001) {
            return Math.abs(value1 - value2) < epsilon;
        }

        function getComputedStyleValue(element, property) {
            return window.getComputedStyle(element).getPropertyValue(property);
        }

        function setStyleProperty(element, property, value) {
            element.style.setProperty(property, value);
        }

        function createTempElementWithStyle(property, value) {
            const tempElement = document.createElement("div");
            tempElement.style.setProperty(property, value);
            document.body.append(tempElement);
            const computedValue = getComputedStyleValue(tempElement, property);
            tempElement.remove();
            return computedValue;
        }

        function setFontSizeAndColumnWidth() {
            const fontSize = function () {
                const tempFontSize = parseFloat(createTempElementWithStyle("font-size", "0.1px"));
                return tempFontSize > 1 ? tempFontSize : 0;
            }();

            const scaleFactor = function (fontSize) {
                const scaledFontSize = 2 * Math.max(fontSize, 1);
                return scaledFontSize / parseFloat(createTempElementWithStyle("font-size", `${scaledFontSize}px`));
            }(fontSize);

            function adjustFontSize() {
                if (fontSize === 0) return;

                setStyleProperty(document.documentElement, MIN_FONT_SIZE, `${fontSize}px`);

                debounceResize(() => {
                    const { clientWidth } = document.documentElement;
                    setStyleProperty(document.documentElement, RESIZE_FACTOR, clientWidth > fontSize ? (clientWidth / fontSize).toPrecision(4) : null);
                }, { runOnLoad: true });
            }

            adjustFontSize();

            if (isApproximatelyEqual(scaleFactor, 1)) return;

            const currentFontSize = parseFloat(getComputedStyleValue(document.documentElement, "font-size"));
            setStyleProperty(document.documentElement, scaleFactor > 1 ? RESIZE_FONT_SIZE_ON_WIDTH_CHANGE : RESIZE_FONT_SIZE_ON_HEIGHT_CHANGE, scaleFactor.toPrecision(4));
        }

        function disableContextMenu() {
            document.querySelectorAll("img, image, video, svg").forEach((element) => {
                element.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                });
            });
        }

        const SCROLLBAR_WIDTH_PROPERTY = "--sbw";
        const INNER_VH_PROPERTY = "--inner1Vh";

        function setScrollbarWidthAndInnerVH() {
            setStyleProperty(document.documentElement, INNER_VH_PROPERTY, window.innerHeight / 100 + "px");

            function adjustScrollbarWidth() {
                const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
                setStyleProperty(document.documentElement, SCROLLBAR_WIDTH_PROPERTY, scrollbarWidth >= 0 ? `${scrollbarWidth}px` : null);
            }

            adjustScrollbarWidth();
        }

        const userAgent = typeof window !== "undefined" ? (window.navigator && window.navigator.userAgent) : null;
        const isNotWebKit = !(!userAgent || !userAgent.match(/AppleWebKit\//) || userAgent.match(/Chrome\//) || userAgent.match(/Chromium\//));

        function removeSVGBackgrounds() {
            document.querySelectorAll("svg").forEach((svgElement) => {
                svgElement.style.background = "url('data:image/png;base64,')";
            });
        }

        let foreignObjectsWithoutWidth;

        function processForeignObjects() {
            if (foreignObjectsWithoutWidth) return;
            foreignObjectsWithoutWidth = Array.from(document.querySelectorAll("foreignObject"))
                .filter((element) => element.getBoundingClientRect().width === 0);

            const getWidthScalingFactor = function () {
                const tempElement = document.createElement("div");
                tempElement.style.fontSize = "100vw";
                document.body.append(tempElement);
                const fontSize = parseFloat(window.getComputedStyle(tempElement).fontSize);
                tempElement.remove();
                return fontSize / window.innerWidth;
            }();

            foreignObjectsWithoutWidth.forEach((foreignObject) => {
                function loadImage() {
                    return new Promise((resolve, reject) => {
                        const imageElement = foreignObject.querySelector("img");
                        if (imageElement && !imageElement.complete) {
                            imageElement.addEventListener("load", () => resolve());
                            imageElement.addEventListener("error", () => reject());
                        } else {
                            resolve();
                        }
                    });
                }

                loadImage().finally(() => {
                    function transformForeignObjects() {
                        const children = Array.from(foreignObject.children);
                        children.forEach((child, index) => {
                            if (child.hasAttribute("data-foreign-object-container")) {
                                child.style.transformOrigin = "";
                                child.style.transform = "";
                            } else {
                                const container = document.createElement("div");
                                container.setAttribute("data-foreign-object-container", "");
                                child.insertAdjacentElement("beforebegin", container);
                                child.remove();
                                container.append(child);
                                children[index] = container;
                            }
                        });

                        const screenCTM = foreignObject.getScreenCTM();
                        if (!screenCTM) return;

                        const { a, b, c, d } = screenCTM.scale(getWidthScalingFactor);
                        children.forEach((child) => {
                            if (!child.hasAttribute("data-foreign-object-container")) return;

                            const { style } = child;
                            style.transformOrigin = "0px 0px";
                            style.transform = `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
                        });
                    }

                    transformForeignObjects();
                });
            });
        }

        [setFontSizeAndColumnWidth, setScrollbarWidthAndInnerVH, isNotWebKit && processForeignObjects, isNotWebKit && removeSVGBackgrounds, disableContextMenu]
            .filter((callback) => typeof callback === "function")
            .forEach((callback) => callback());
    }();

