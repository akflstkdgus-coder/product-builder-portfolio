
# **Project Blueprint: Lotto Number Generator**

## **1. Overview**

This document outlines the plan for creating a dynamic and visually appealing Lotto Number Generator web application. The goal is to build a user-friendly, mobile-responsive, and interactive single-page application using modern web technologies (HTML, CSS, JavaScript) without any external frameworks.

## **2. Design & Features**

### **Aesthetics & Visual Design**

*   **Layout:** A clean, centered layout that is easy to navigate on both desktop and mobile devices.
*   **Color Palette:** A vibrant and energetic color scheme will be used.
    *   Background: A subtle noise texture over a dark gradient.
    *   Primary Action Color (Button): A bright, glowing color to draw attention.
    *   Number Display: Each number will have its own styled container with a distinct look.
*   **Typography:** Expressive and clear typography to enhance readability. A modern, bold font will be used for titles and numbers.
*   **Iconography & Effects:**
    *   Subtle animations on the numbers appearing.
    *   A "glow" effect on the "Generate" button.
    *   Drop shadows to create a sense of depth and lift UI elements off the page.

### **Functionality**

*   **Core Feature:** Generate 6 unique random numbers between 1 and 45.
*   **User Interaction:**
    *   A single, prominent button to trigger the number generation.
    *   The generated numbers will be displayed clearly in a dedicated section.
*   **Web Component:** A custom element `<lotto-ball>` will be created to display each individual number, encapsulating its style and behavior.

## **3. Implementation Plan**

### **Phase 1: HTML Structure (`index.html`)**

1.  **Update Document Metadata:** Change the `<title>` to "Lotto Number Generator".
2.  **Create App Container:** Set up a main `<div>` to wrap the entire application.
3.  **Add Header:** Include a `<h1>` for the application title.
4.  **Add Number Display Area:** Create a container that will hold the generated lotto balls.
5.  **Add Action Button:** Add a `<button>` to initiate the number generation.
6.  **Link Scripts:** Ensure `main.js` and `style.css` are correctly linked.

### **Phase 2: Styling (`style.css`)**

1.  **Global Styles:** Set up CSS variables for colors, fonts, and spacing. Apply a base style to the `<body>` for the background and typography.
2.  **Layout Styling:** Style the main app container to be centered on the page.
3.  **Component Styling:**
    *   Style the header, button, and number display area.
    *   Implement the "glow" effect and drop shadows.
4.  **Web Component Styling:** The styling for the `<lotto-ball>` custom element will be encapsulated within its Shadow DOM.

### **Phase 3: JavaScript Logic (`main.js`)**

1.  **Web Component Definition:**
    *   Create a class `LottoBall` that extends `HTMLElement`.
    *   Use the Shadow DOM to define the structure and style for each ball (a circle with a number inside).
    *   Define the custom element with `customElements.define('lotto-ball', LottoBall)`.
2.  **Number Generation Logic:**
    *   Create a function `generateNumbers()` that:
        *   Creates a set to store unique numbers.
        *   Loops until 6 unique numbers between 1 and 45 are generated.
        *   Returns the sorted array of numbers.
3.  **DOM Manipulation:**
    *   Get references to the button and the number display container.
    *   Add a 'click' event listener to the button.
    *   On click, clear the previous numbers, call `generateNumbers()`, and create and append a new `<lotto-ball>` element for each number into the display container.

This plan ensures a structured and iterative development process, leveraging modern web features to create a high-quality application.
