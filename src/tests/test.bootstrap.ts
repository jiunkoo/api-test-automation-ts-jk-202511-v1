import { installAxiosAuthAutoWrap } from "../utils/axios-bearer-auth";
import { installLoggerAutoWrap } from "../utils/logger";

installAxiosAuthAutoWrap();
installLoggerAutoWrap();
