"use strict";

/*
    Mango Arty4 MGRS

    การทำงาน:
    1. รับพิกัด MGRS จำนวน 2 จุด
    2. แปลง MGRS เป็น Latitude / Longitude
    3. แปลงทั้งสองจุดเข้าสู่ระบบ UTM Zone เดียวกัน
    4. คำนวณระยะทางกริดเป็นเมตร
    5. คำนวณมุมทิศกริดจากทิศเหนือ
    6. แปลงองศาเป็นมิลเลียม

    สูตร:
    มิลเลียม = องศา ÷ 0.05625
*/


// ==================================================
// 1. เชื่อมต่อกับส่วนต่าง ๆ ในหน้า index.html
// ==================================================

const point1Input = document.getElementById("mgrsPoint1");
const point2Input = document.getElementById("mgrsPoint2");

const calculateButton = document.getElementById("calculateButton");
const clearButton = document.getElementById("clearButton");

const distanceResult = document.getElementById("distanceResult");
const degreeResult = document.getElementById("degreeResult");
const milResult = document.getElementById("milResult");
const reverseMilResult = document.getElementById("reverseMilResult");
const messageBox = document.getElementById("messageBox");


// ==================================================
// 2. ฟังก์ชันจัดรูปแบบข้อมูล
// ==================================================

function cleanMgrs(value) {
    return value
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}


function normalizeDegrees(degrees) {
    let normalized = degrees % 360;

    if (normalized < 0) {
        normalized += 360;
    }

    return normalized;
}


function degreesToMils(degrees) {
    return degrees / 0.05625;
}


function formatMils(mils) {
    let roundedMils = Math.round(mils);

    if (roundedMils < 0) {
        roundedMils += 6400;
    }

    if (roundedMils > 6400) {
        roundedMils %= 6400;
    }

    return String(roundedMils).padStart(4, "0");
}


// ==================================================
// 3. อ่านหมายเลข UTM Zone และแถบละติจูดจาก MGRS
// ==================================================

function readMgrsZone(mgrsText) {
    const zoneMatch = mgrsText.match(/^(\d{1,2})([C-HJ-NP-X])/);

    if (!zoneMatch) {
        throw new Error("ไม่สามารถอ่านหมายเลข UTM Zone จากพิกัดได้");
    }

    const zoneNumber = Number(zoneMatch[1]);
    const latitudeBand = zoneMatch[2];

    if (zoneNumber < 1 || zoneNumber > 60) {
        throw new Error("หมายเลข UTM Zone ต้องอยู่ระหว่าง 1 ถึง 60");
    }

    return {
        zoneNumber,
        latitudeBand
    };
}


// ==================================================
// 4. สร้างคำสั่งระบบพิกัด UTM
// ==================================================

function createUtmDefinition(zoneNumber, latitudeBand) {
    const isSouthernHemisphere = latitudeBand < "N";

    let definition =
        `+proj=utm +zone=${zoneNumber} ` +
        `+datum=WGS84 +units=m +no_defs`;

    if (isSouthernHemisphere) {
        definition += " +south";
    }

    return definition;
}


// ==================================================
// 5. ล้างผลการคำนวณ
// ==================================================

function clearResults() {
    distanceResult.textContent = "0 เมตร";
    degreeResult.textContent = "0.000°";
    milResult.textContent = "0000 มิล";
    reverseMilResult.textContent = "0000 มิล";
    messageBox.textContent = "";
}


// ==================================================
// 6. คำนวณระยะและทิศทาง
// ==================================================

function calculateCoordinates() {
    clearResults();

    const point1 = cleanMgrs(point1Input.value);
    const point2 = cleanMgrs(point2Input.value);

    if (point1 === "" || point2 === "") {
        messageBox.textContent = "กรุณากรอกพิกัดทั้ง 2 จุด";
        return;
    }

    if (typeof mgrs === "undefined") {
        messageBox.textContent =
            "ไม่พบไลบรารี MGRS กรุณาตรวจสอบไฟล์ index.html";
        return;
    }

    if (typeof proj4 === "undefined") {
        messageBox.textContent =
            "ไม่พบไลบรารี Proj4 กรุณาตรวจสอบไฟล์ index.html";
        return;
    }

    try {
        /*
            mgrs.toPoint() คืนค่าเป็น:
            [ลองจิจูด, ละติจูด]
        */

        const coordinate1 = mgrs.toPoint(point1);
        const coordinate2 = mgrs.toPoint(point2);

        const longitude1 = coordinate1[0];
        const latitude1 = coordinate1[1];

        const longitude2 = coordinate2[0];
        const latitude2 = coordinate2[1];

        /*
            ใช้ Zone ของจุดที่ 1 เป็นระบบกริดหลัก
            แล้วแปลงทั้ง 2 จุดเข้าสู่ UTM Zone เดียวกัน
        */

        const zoneInfo = readMgrsZone(point1);

        const utmDefinition = createUtmDefinition(
            zoneInfo.zoneNumber,
            zoneInfo.latitudeBand
        );

        const utmPoint1 = proj4(
            "EPSG:4326",
            utmDefinition,
            [longitude1, latitude1]
        );

        const utmPoint2 = proj4(
            "EPSG:4326",
            utmDefinition,
            [longitude2, latitude2]
        );

        const easting1 = utmPoint1[0];
        const northing1 = utmPoint1[1];

        const easting2 = utmPoint2[0];
        const northing2 = utmPoint2[1];

        const deltaEasting = easting2 - easting1;
        const deltaNorthing = northing2 - northing1;

        /*
            ระยะทางกริด:
            √(ผลต่าง Easting² + ผลต่าง Northing²)
        */

        const distance = Math.hypot(
            deltaEasting,
            deltaNorthing
        );

        if (distance < 0.001) {
            messageBox.textContent =
                "พิกัดทั้ง 2 จุดเป็นตำแหน่งเดียวกัน";
            return;
        }

        /*
            มุมทิศกริด:
            วัดตามเข็มนาฬิกาจากทิศเหนือ

            atan2(
                ผลต่าง Easting,
                ผลต่าง Northing
            )
        */

        let bearing =
            Math.atan2(
                deltaEasting,
                deltaNorthing
            ) * 180 / Math.PI;

        bearing = normalizeDegrees(bearing);

        /*
            ป้องกันค่าคลาดเคลื่อนเล็กน้อยจากการแปลงพิกัด

            ถ้า Easting แทบเท่ากันและ Northing เพิ่มขึ้น
            ให้ถือว่าเป็นทิศเหนือ 360 องศา
        */

        if (
            Math.abs(deltaEasting) < 0.05 &&
            deltaNorthing > 0
        ) {
            bearing = 360;
        } else if (
            bearing < 0.0005 ||
            bearing > 359.9995
        ) {
            bearing = 360;
        }

        const mils = degreesToMils(bearing);

        /*
            คำนวณทิศกลับ
        */

        let reverseBearing;

        if (bearing === 360) {
            reverseBearing = 180;
        } else {
            reverseBearing = normalizeDegrees(
                bearing + 180
            );

            if (reverseBearing === 0) {
                reverseBearing = 360;
            }
        }

        const reverseMils =
            degreesToMils(reverseBearing);

        /*
            แสดงผล
        */

        distanceResult.textContent =
            `${distance.toFixed(2)} เมตร`;

        degreeResult.textContent =
            `${bearing.toFixed(3)}°`;

        milResult.textContent =
            `${formatMils(mils)} มิล`;

        reverseMilResult.textContent =
            `${formatMils(reverseMils)} มิล`;

        messageBox.textContent =
            "คำนวณเรียบร้อยแล้ว";

    } catch (error) {
        console.error(error);

        messageBox.textContent =
            "พิกัด MGRS ไม่ถูกต้อง กรุณาตรวจสอบตัวเลขและตัวอักษร";
    }
}


// ==================================================
// 7. ล้างข้อมูลทั้งหมด
// ==================================================

function clearAll() {
    point1Input.value = "";
    point2Input.value = "";

    clearResults();

    point1Input.focus();
}


// ==================================================
// 8. เปลี่ยนตัวอักษรที่กรอกให้เป็นตัวพิมพ์ใหญ่
// ==================================================

function convertInputToUppercase(event) {
    event.target.value =
        event.target.value.toUpperCase();
}


// ==================================================
// 9. เชื่อมปุ่มกับฟังก์ชัน
// ==================================================

calculateButton.addEventListener(
    "click",
    calculateCoordinates
);

clearButton.addEventListener(
    "click",
    clearAll
);

point1Input.addEventListener(
    "input",
    convertInputToUppercase
);

point2Input.addEventListener(
    "input",
    convertInputToUppercase
);


// กด Enter ในช่องใดก็ได้เพื่อคำนวณ

point1Input.addEventListener(
    "keydown",
    function (event) {
        if (event.key === "Enter") {
            calculateCoordinates();
        }
    }
);

point2Input.addEventListener(
    "keydown",
    function (event) {
        if (event.key === "Enter") {
            calculateCoordinates();
        }
    }
);


// ==================================================
// 10. ตั้งค่าหน้าเริ่มต้น
// ==================================================

clearResults();
// ลงทะเบียน Service Worker
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("./service-worker.js")
            .then(() => {
                console.log("Service Worker Registered");
            })
            .catch((err) => {
                console.error("Service Worker Error:", err);
            });
    });
}