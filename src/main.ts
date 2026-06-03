import "./style.css";
import { startRouter } from "./ui/router";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) startRouter(app);
