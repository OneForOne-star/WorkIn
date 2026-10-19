-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost:3306
-- Tiempo de generación: 18-10-2026 a las 23:15:47
-- Versión del servidor: 10.11.11-MariaDB-cll-lve
-- Versión de PHP: 8.3.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `cot17682_RecDan`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `administrador`
--

CREATE TABLE `administrador` (
  `IdAdministrador` int(11) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `apellido` varchar(50) NOT NULL,
  `IdUsuario` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `administrador`
--

INSERT INTO `administrador` (`IdAdministrador`, `nombre`, `apellido`, `IdUsuario`) VALUES
(1, 'Daniel', 'Plasencia', 2);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `apoyo`
--

CREATE TABLE `apoyo` (
  `IdApoyo` int(11) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `apellido` varchar(50) NOT NULL,
  `IdUsuario` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `apoyo`
--

INSERT INTO `apoyo` (`IdApoyo`, `nombre`, `apellido`, `IdUsuario`) VALUES
(1, 'Daniel', 'Plasencia', 1),
(3, 'Marcela', 'Espinoza', 4),
(4, 'Thai', 'Uchi', 5),
(5, 'Aracely', 'Gutierrez', 6),
(6, 'Yuly', 'Landa', 7),
(7, 'Ariel', 'Ortega', 8),
(8, 'Belen', 'Gutierrez', 9),
(9, 'Sofia', 'Bravo', 10),
(10, 'Ismael', 'Andrades', 11),
(11, 'Fernanda', 'Vicuña', 12),
(12, 'Renata', 'Diaz', 13),
(13, 'Ignacia', 'Riveros', 14);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `asistencia`
--

CREATE TABLE `asistencia` (
  `IdAsistencia` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `HoraInicioTurno` time DEFAULT NULL,
  `HoraFinTurno` time DEFAULT NULL,
  `PagoTurno` int(11) DEFAULT NULL,
  `Comentarios` mediumtext DEFAULT NULL,
  `aceptado` tinyint(1) DEFAULT 0,
  `IdUsuario` int(11) NOT NULL,
  `IdEmpresa` int(11) NOT NULL,
  `eliminado` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `asistencia`
--

INSERT INTO `asistencia` (`IdAsistencia`, `fecha`, `HoraInicioTurno`, `HoraFinTurno`, `PagoTurno`, `Comentarios`, `aceptado`, `IdUsuario`, `IdEmpresa`, `eliminado`, `created_at`) VALUES
(22, '2026-05-04', '13:30:00', '17:30:00', 15000, 'a peticion de andrea llegue a las 11:30', 1, 1, 1, 0, '2026-05-15 23:54:37'),
(23, '2026-05-05', '13:30:00', '17:30:00', 15000, NULL, 1, 1, 1, 0, '2026-05-15 23:54:37'),
(24, '2026-05-06', '13:30:00', '17:30:00', 15000, NULL, 1, 1, 1, 0, '2026-05-15 23:54:37'),
(25, '2026-05-07', '13:30:00', '17:30:00', 15000, 'a peticion de andrea llegue lo antes posible llegando 12:30', 0, 1, 1, 0, '2026-05-15 23:54:37'),
(26, '2026-05-10', '13:30:00', '17:30:00', 15000, NULL, 0, 1, 1, 0, '2026-05-15 23:54:37'),
(27, '2026-05-11', '13:30:00', '17:30:00', 15000, 'A peticion de andrea llegue 11:30', 1, 1, 1, 0, '2026-05-15 23:54:37'),
(28, '2026-05-12', '13:30:00', '17:30:00', 15000, NULL, 1, 1, 1, 0, '2026-05-15 23:54:37'),
(29, '2026-05-13', '13:30:00', '17:30:00', 15000, '', 0, 1, 1, 1, '2026-05-15 23:54:37'),
(30, '2026-05-13', '13:30:00', '17:30:00', 15000, '', 1, 1, 1, 0, '2026-05-15 23:54:37'),
(31, '2026-05-14', '14:30:00', '18:30:00', 15000, '', 1, 1, 1, 0, '2026-05-15 23:54:37'),
(32, '2026-05-15', '13:30:00', '17:30:00', 15000, 'No', 1, 1, 1, 0, '2026-05-15 23:54:37'),
(33, '2026-05-15', '13:30:00', '17:30:00', 15000, '', 0, 9, 1, 1, '2026-05-15 23:54:37'),
(34, '2026-05-15', '13:30:00', '17:30:00', 15000, '', 1, 9, 1, 0, '2026-05-15 23:54:37'),
(35, '2026-05-04', '13:30:00', '17:30:00', 15000, NULL, 1, 9, 1, 0, '2026-05-15 23:54:37'),
(36, '2026-05-05', '13:30:00', '17:30:00', 15000, NULL, 1, 9, 1, 0, '2026-05-15 23:54:37'),
(37, '2026-05-06', '13:30:00', '17:30:00', 15000, NULL, 1, 9, 1, 0, '2026-05-15 23:54:37'),
(38, '2026-05-07', '13:30:00', '17:30:00', NULL, NULL, 1, 9, 1, 0, '2026-05-15 23:54:37'),
(47, '2026-05-11', '13:30:00', '17:30:00', 15000, NULL, 0, 9, 1, 0, '2026-05-15 23:54:37'),
(48, '2026-05-12', '13:30:00', '17:30:00', 15000, NULL, 1, 9, 1, 0, '2026-05-15 23:54:37'),
(49, '2026-05-13', '13:30:00', '17:30:00', 15000, NULL, 1, 9, 1, 0, '2026-05-15 23:54:37'),
(50, '2026-05-14', '13:30:00', '17:30:00', 15000, NULL, 1, 9, 1, 0, '2026-05-15 23:54:37'),
(51, '2026-05-15', '22:02:00', '22:00:00', 15000, '', 1, 9, 1, 1, '2026-05-16 00:00:12'),
(52, '2026-05-17', '20:45:00', '20:45:00', 123123, '', 0, 1, 1, 1, '2026-05-17 21:42:40'),
(53, '2026-05-17', '20:19:00', '22:21:00', 0, '', 1, 1, 1, 1, '2026-05-17 22:17:56'),
(54, '2026-05-01', '20:40:00', '00:44:00', 15000, '', 1, 3, 1, 1, '2026-05-17 22:38:50'),
(55, '2026-05-02', '20:40:00', '00:44:00', 15000, '', 1, 3, 1, 1, '2026-05-17 22:38:50'),
(56, '2026-05-18', '17:30:00', '20:39:00', 15000, '', 1, 10, 1, 0, '2026-05-18 21:29:53'),
(57, '2026-05-20', '13:30:00', '17:30:00', 15000, '', 1, 12, 1, 0, '2026-05-20 19:25:26'),
(58, '2026-05-18', '13:30:00', '17:30:00', 15000, '', 1, 12, 1, 0, '2026-05-20 19:44:56'),
(59, '2026-05-19', '13:30:00', '17:30:00', 15000, '', 1, 12, 1, 0, '2026-05-20 19:44:56'),
(60, '2026-05-18', '13:30:00', '17:30:00', 15000, '', 1, 1, 1, 0, '2026-05-21 20:40:33'),
(61, '2026-05-19', '13:30:00', '17:30:00', 15000, '', 1, 1, 1, 0, '2026-05-21 20:40:33'),
(62, '2026-05-20', '13:30:00', '17:30:00', 15000, '', 1, 1, 1, 0, '2026-05-21 20:40:33'),
(63, '2026-05-22', '13:29:00', '17:30:00', 15000, 'Hora extra a peticion de andrea', 1, 1, 1, 0, '2026-05-22 13:17:09'),
(64, '2026-05-25', '11:00:00', '17:30:00', 15000, '', 1, 1, 1, 0, '2026-05-25 14:53:03'),
(65, '2026-05-25', '13:30:00', '17:30:00', 15000, '', 1, 12, 1, 0, '2026-05-25 15:21:18'),
(66, '2026-05-26', '13:30:00', '17:30:00', 15000, '', 1, 12, 1, 0, '2026-05-26 19:54:15'),
(67, '2026-05-26', '13:30:00', '17:29:00', 15000, '', 1, 1, 1, 0, '2026-05-27 03:24:40'),
(68, '2026-05-27', '13:30:00', '17:30:00', 15000, '', 1, 1, 1, 0, '2026-05-27 16:04:27'),
(69, '2026-05-28', '13:30:00', '17:30:00', 15000, '', 1, 1, 1, 0, '2026-05-28 16:47:59'),
(70, '2026-05-28', '13:30:00', '05:30:00', 15000, '', 1, 14, 1, 1, '2026-05-28 23:56:43'),
(71, '2026-05-18', '13:30:00', '17:30:00', 15000, '', 1, 14, 1, 0, '2026-05-29 00:03:51'),
(72, '2026-05-19', '13:30:00', '17:30:00', 15000, '', 1, 14, 1, 0, '2026-05-29 00:03:51'),
(73, '2026-05-20', '13:30:00', '17:30:00', 15000, '', 1, 14, 1, 0, '2026-05-29 00:03:51'),
(74, '2026-05-22', '13:30:00', '17:30:00', 15000, '', 1, 14, 1, 0, '2026-05-29 00:03:51'),
(75, '2026-05-25', '13:30:00', '17:30:00', 15000, '', 1, 14, 1, 0, '2026-05-29 00:03:51'),
(76, '2026-05-28', '13:30:00', '17:30:00', 15000, '', 1, 14, 1, 0, '2026-05-29 00:06:20'),
(77, '2026-05-29', '13:30:00', '17:30:00', 10000, '', 1, 1, 1, 0, '2026-05-29 14:58:16');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `contrato`
--

CREATE TABLE `contrato` (
  `IdContrato` int(11) NOT NULL,
  `IdUsuario` int(11) NOT NULL,
  `IdEmpresa` int(11) NOT NULL,
  `tipo_servicio` varchar(200) NOT NULL COMMENT 'Glosa para la boleta de honorarios',
  `valor_turno_base` int(11) DEFAULT NULL COMMENT 'Monto default a prellenar por turno',
  `valor_hora_extra_base` int(11) DEFAULT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_termino` date DEFAULT NULL COMMENT 'NULL = vigente/indefinido',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `empresa`
--

CREATE TABLE `empresa` (
  `IdEmpresa` int(11) NOT NULL,
  `razon_social` varchar(150) NOT NULL,
  `nombre_fantasia` varchar(150) DEFAULT NULL,
  `rut_empresa` varchar(12) DEFAULT NULL,
  `email_contacto` varchar(100) DEFAULT NULL,
  `telefono_contacto` varchar(20) DEFAULT NULL,
  `plan` enum('trial','basico','pro','enterprise') NOT NULL DEFAULT 'trial',
  `max_trabajadores_activos` int(11) NOT NULL DEFAULT 10,
  `fecha_vencimiento_plan` date DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `empresa`
--

INSERT INTO `empresa` (`IdEmpresa`, `razon_social`, `nombre_fantasia`, `rut_empresa`, `email_contacto`, `telefono_contacto`, `plan`, `max_trabajadores_activos`, `fecha_vencimiento_plan`, `activa`, `created_at`, `updated_at`) VALUES
(1, 'Empresa por definir (datos migrados)', 'Cliente actual', NULL, NULL, NULL, 'pro', 100, NULL, 1, '2026-09-25 11:52:45', '2026-09-25 11:52:45');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `HoraExtra`
--

CREATE TABLE `HoraExtra` (
  `IdHoraExtra` int(11) NOT NULL,
  `cantidad` decimal(5,2) DEFAULT NULL,
  `dia` date DEFAULT NULL,
  `ValorHoraExtra` int(11) DEFAULT NULL,
  `Comentarios` mediumtext DEFAULT NULL,
  `IdAsistencia` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `HoraExtra`
--

INSERT INTO `HoraExtra` (`IdHoraExtra`, `cantidad`, `dia`, `ValorHoraExtra`, `Comentarios`, `IdAsistencia`) VALUES
(17, 2.00, '2026-05-04', 4000, 'a peticion de andrea llegue a las 11:30', 22),
(18, 1.00, '2026-05-07', 4000, 'a peticion de andrea llegue lo antes posible llegando 12:30', 25),
(19, 2.00, '2026-05-11', 4000, 'A peticion de andrea llegue 11:30', 27),
(22, 2.50, '2026-05-12', 4000, NULL, 36),
(23, 1.50, '2026-05-15', 4000, NULL, 32),
(24, 2.00, '2026-05-22', 2000, NULL, 63),
(25, 2.00, '2026-05-25', 4000, NULL, 64),
(26, 2.50, '2026-05-25', 4000, NULL, 65),
(27, 2.00, '2026-05-28', 4000, NULL, 70),
(28, 2.50, '2026-05-28', 4000, NULL, 76),
(29, 2.00, '2026-05-29', 9000, NULL, 77);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `NextDay`
--

CREATE TABLE `NextDay` (
  `IdNextDay` int(11) NOT NULL,
  `idasistencia` int(11) DEFAULT NULL,
  `Fecha` date DEFAULT NULL,
  `hora_inicio` time DEFAULT NULL,
  `hora_fin` time DEFAULT NULL,
  `comentarios` mediumtext DEFAULT NULL,
  `PagoNextDay` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `NextDay`
--

INSERT INTO `NextDay` (`IdNextDay`, `idasistencia`, `Fecha`, `hora_inicio`, `hora_fin`, `comentarios`, `PagoNextDay`) VALUES
(15, 36, '2026-05-11', '17:30:00', '20:30:00', NULL, 15000),
(16, 48, '2026-05-11', '17:30:00', '20:30:00', NULL, 15000);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `turno_planificado`
--

CREATE TABLE `turno_planificado` (
  `IdTurno` int(11) NOT NULL,
  `IdUsuario` int(11) NOT NULL,
  `IdEmpresa` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `hora_inicio_prevista` time NOT NULL,
  `hora_fin_prevista` time NOT NULL,
  `estado` enum('planificado','confirmado','cumplido','no_show','cancelado') NOT NULL DEFAULT 'planificado',
  `IdAsistencia` int(11) DEFAULT NULL COMMENT 'Se enlaza cuando el trabajador marca de verdad',
  `creado_por` int(11) DEFAULT NULL COMMENT 'IdUsuario del admin que armo el turno',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuario`
--

CREATE TABLE `usuario` (
  `IdUsuario` int(11) NOT NULL,
  `IdEmpresa` int(11) DEFAULT NULL,
  `rol` enum('super_admin','admin_empresa','apoyo') NOT NULL,
  `correo` varchar(100) NOT NULL,
  `contrasena` varchar(255) NOT NULL,
  `rut` varchar(12) NOT NULL,
  `fechaCreacion` datetime DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `activo` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `usuario`
--

INSERT INTO `usuario` (`IdUsuario`, `IdEmpresa`, `rol`, `correo`, `contrasena`, `rut`, `fechaCreacion`, `created_at`, `updated_at`, `activo`) VALUES
(1, 1, 'apoyo', 'nombreparacuentas1234@gmail.com', 'scrypt:32768:8:1$BmOQVsXlnSPQ84E2$51670641a71e08ed06bfa0df8fce44389c9392d96af90d3b5af2aa995dde5063d6666a46419b37437e139aef01700e72f4010a33729c5aaa154b88df0da9c3dc', '21751534-3', '2026-05-10 23:08:52', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(2, 1, 'admin_empresa', 'da.plasencia@duocuc.cl', 'scrypt:32768:8:1$kdzJYp1me9YHF8bq$30979d401c242c775e8f97ec3f2c70a6821ac8d74812cd3599cd2696130d7f911c485968e89d3f0078d06b27c574846fe44ae1e4f6cd828fa4cef50b588aa638', '11111111-3', '2026-05-13 00:21:04', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(3, 1, 'apoyo', 'danielusuario@gmail.com', 'scrypt:32768:8:1$FgTwLz1MnVlQjCcx$c7e3447ad22a0fa56099e2b2910cabe94ae8876b371c038719693d4e61477ca5e10070ec64ef1279aed2370ccd21af15d911f55a736170b45bd497de6819425f', '18532354-4', '2026-05-13 09:33:07', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(4, 1, 'apoyo', 'marce.espinozaramirez@gmail.com', 'scrypt:32768:8:1$o55BRaBk24R8qR1S$86e69cb190c8ec8e4592f9bbc4de69e8d202859f7b078fbf245a38cd997e300e6a41c0b92aa25d478fd428c3bee3d80d7ee176b95cfa7ed558e5547ac1ca8bb3', '22129076-3', '2026-05-14 21:31:26', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(5, 1, 'apoyo', 'Thailyuchasara5@gmail.com', 'scrypt:32768:8:1$f3HKfGufocqOnl4U$d2d0b0e6964b08a43d77d6b24afe0cc9aca162eea4a70e25bcc27b34036809721e4fdedf6c6e9338e9f96a29a067d45ff4c94e428473017828b73cb78895511d', '24380014-5', '2026-05-15 18:13:53', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(6, 1, 'apoyo', 'aracelyabigail1988@gmail.com', 'scrypt:32768:8:1$bZJnNiiPWH94Qokx$eff61e6702311294beaf221992b1c6e9e0aaa4cb046ebacfb755b848d6a56b6ed8e0fce98f653652708e161ea808716a242e93a4d0cdff47c7ded7c1c5596c6a', '22970108-9', '2026-05-15 18:15:01', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(7, 1, 'apoyo', 'yuly.landa.sanchez@gmail.com', 'scrypt:32768:8:1$nPgtZOsknhewpscZ$6ccfec57d73144aafe8a13f48adc0d8b4123de9dcc6284be853870dac87d9e6408bc14bc6aa9780c597076953f73d447249b143aa13ae31d7c2d706df1d245d6', '229203274', '2026-05-15 18:19:51', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(8, 1, 'apoyo', 'ortegavariel@gmail.com', 'scrypt:32768:8:1$TlJOXbNbbSVvyk8g$5e88b6b2d548dd9a7cae5d8458e081d93758f1ad200ba61b34300fe22e114033367ce4cf0d163abba84c201c8a313ae965f5748b555a0889095bc14bdb2e54e5', '19847061-9', '2026-05-15 19:52:53', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(9, 1, 'apoyo', 'Belen.alondra.gs@gmail.com', 'scrypt:32768:8:1$gdv1sStArwSWTqcw$f9d93fdc8baa9c6e21e0c1df845aeac6aa1e8beb04d60b241196d72e2f7044ac0085d9a898677ad032e23165197a2c8d8a50afedb4eb1bf6976b277a2605db1b', '20.823.415-3', '2026-05-15 22:47:45', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(10, 1, 'apoyo', 'bravorojas.sofia@gmail.com', 'scrypt:32768:8:1$KkCpIrHY40AqZAUG$ddad7f2392afdf921eac37b943aca6cda6db49580858e05a94ce296c7aa05be21f9d094b94c9226a9bf58d33161e1a7abe53852c9a3ede994ef9854664af21d4', '20640258-k', '2026-05-18 21:29:10', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(11, 1, 'apoyo', 'ismaelstark1122@gmail.com', 'scrypt:32768:8:1$Oi8VXvHLNgHfsWfo$492ca55ebd2c1aee7116934884ba8f51aee814ca4add0e09d7ca2ca9db245dc5fe92583c27c2f9b9c95b4313b066872f73167b90c2573e8217ae205248bbd19c', '20845747-0', '2026-05-18 21:31:38', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(12, 1, 'apoyo', 'fernandajulliet3658@gmail.com', 'scrypt:32768:8:1$IAN45wKMfCzaMMF6$42d418672dc887e91446137131fd6d80aed2af82a6ecafc95ccef476e1c9fe6a326bd261bd8effd4a81c3bc1cfc81ce1d8e1ce6044f1a40f92fb47c89931c768', '221218582', '2026-05-18 21:32:21', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(13, 1, 'apoyo', 'renadiaz2989xb@gmail.com', 'scrypt:32768:8:1$NBH5ciB0SXJUh83S$a168e5b7c9defd0b7b9208d68da12f96fe2c39bddabb4606ac89f1bab7e661d40a3e8d56ac9fb304447fd30259cff69ac1707ccecea04bab8989ef960d6dc04b', '22682597-5', '2026-05-18 21:34:39', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1),
(14, 1, 'apoyo', 'ignariverosolguin@gmail.com', 'scrypt:32768:8:1$dCXHRsondWNOQ33p$709d74feb6eb262c04ea793ba034aa637d889d7e54b0871fd69cea64298318b765a7169a029bcfcf5155ea525f0d392cdd292912e123414f29e72a0c3bddaba9', '21.675.581-2', '2026-05-28 22:03:15', '2026-09-25 11:52:45', '2026-09-25 11:52:45', 1);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `administrador`
--
ALTER TABLE `administrador`
  ADD PRIMARY KEY (`IdAdministrador`),
  ADD KEY `IdUsuario` (`IdUsuario`);

--
-- Indices de la tabla `apoyo`
--
ALTER TABLE `apoyo`
  ADD PRIMARY KEY (`IdApoyo`),
  ADD KEY `IdUsuario` (`IdUsuario`);

--
-- Indices de la tabla `asistencia`
--
ALTER TABLE `asistencia`
  ADD PRIMARY KEY (`IdAsistencia`),
  ADD KEY `idx_asistencia_empresa_fecha` (`IdEmpresa`,`fecha`),
  ADD KEY `idx_asistencia_usuario_fecha` (`IdUsuario`,`fecha`),
  ADD KEY `idx_asistencia_empresa_aceptado` (`IdEmpresa`,`aceptado`,`eliminado`);

--
-- Indices de la tabla `contrato`
--
ALTER TABLE `contrato`
  ADD PRIMARY KEY (`IdContrato`),
  ADD KEY `idx_contrato_usuario` (`IdUsuario`),
  ADD KEY `idx_contrato_empresa` (`IdEmpresa`);

--
-- Indices de la tabla `empresa`
--
ALTER TABLE `empresa`
  ADD PRIMARY KEY (`IdEmpresa`),
  ADD UNIQUE KEY `uq_empresa_rut` (`rut_empresa`);

--
-- Indices de la tabla `HoraExtra`
--
ALTER TABLE `HoraExtra`
  ADD PRIMARY KEY (`IdHoraExtra`),
  ADD KEY `IdAsistencia` (`IdAsistencia`);

--
-- Indices de la tabla `NextDay`
--
ALTER TABLE `NextDay`
  ADD PRIMARY KEY (`IdNextDay`),
  ADD KEY `idasistencia` (`idasistencia`);

--
-- Indices de la tabla `turno_planificado`
--
ALTER TABLE `turno_planificado`
  ADD PRIMARY KEY (`IdTurno`),
  ADD KEY `idx_turno_usuario_fecha` (`IdUsuario`,`fecha`),
  ADD KEY `idx_turno_empresa_fecha` (`IdEmpresa`,`fecha`),
  ADD KEY `fk_turno_asistencia` (`IdAsistencia`);

--
-- Indices de la tabla `usuario`
--
ALTER TABLE `usuario`
  ADD PRIMARY KEY (`IdUsuario`),
  ADD UNIQUE KEY `correo` (`correo`),
  ADD UNIQUE KEY `rut` (`rut`),
  ADD KEY `idx_usuario_empresa` (`IdEmpresa`),
  ADD KEY `idx_usuario_rol` (`rol`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `administrador`
--
ALTER TABLE `administrador`
  MODIFY `IdAdministrador` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de la tabla `apoyo`
--
ALTER TABLE `apoyo`
  MODIFY `IdApoyo` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT de la tabla `asistencia`
--
ALTER TABLE `asistencia`
  MODIFY `IdAsistencia` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=78;

--
-- AUTO_INCREMENT de la tabla `contrato`
--
ALTER TABLE `contrato`
  MODIFY `IdContrato` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `empresa`
--
ALTER TABLE `empresa`
  MODIFY `IdEmpresa` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de la tabla `HoraExtra`
--
ALTER TABLE `HoraExtra`
  MODIFY `IdHoraExtra` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=30;

--
-- AUTO_INCREMENT de la tabla `NextDay`
--
ALTER TABLE `NextDay`
  MODIFY `IdNextDay` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT de la tabla `turno_planificado`
--
ALTER TABLE `turno_planificado`
  MODIFY `IdTurno` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuario`
--
ALTER TABLE `usuario`
  MODIFY `IdUsuario` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `administrador`
--
ALTER TABLE `administrador`
  ADD CONSTRAINT `administrador_ibfk_1` FOREIGN KEY (`IdUsuario`) REFERENCES `usuario` (`IdUsuario`) ON DELETE CASCADE;

--
-- Filtros para la tabla `apoyo`
--
ALTER TABLE `apoyo`
  ADD CONSTRAINT `apoyo_ibfk_1` FOREIGN KEY (`IdUsuario`) REFERENCES `usuario` (`IdUsuario`) ON DELETE CASCADE;

--
-- Filtros para la tabla `asistencia`
--
ALTER TABLE `asistencia`
  ADD CONSTRAINT `fk_asistencia_empresa` FOREIGN KEY (`IdEmpresa`) REFERENCES `empresa` (`IdEmpresa`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asistencia_usuario` FOREIGN KEY (`IdUsuario`) REFERENCES `usuario` (`IdUsuario`) ON DELETE CASCADE;

--
-- Filtros para la tabla `contrato`
--
ALTER TABLE `contrato`
  ADD CONSTRAINT `fk_contrato_empresa` FOREIGN KEY (`IdEmpresa`) REFERENCES `empresa` (`IdEmpresa`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_contrato_usuario` FOREIGN KEY (`IdUsuario`) REFERENCES `usuario` (`IdUsuario`) ON DELETE CASCADE;

--
-- Filtros para la tabla `HoraExtra`
--
ALTER TABLE `HoraExtra`
  ADD CONSTRAINT `HoraExtra_ibfk_1` FOREIGN KEY (`IdAsistencia`) REFERENCES `asistencia` (`IdAsistencia`) ON DELETE CASCADE;

--
-- Filtros para la tabla `NextDay`
--
ALTER TABLE `NextDay`
  ADD CONSTRAINT `NextDay_ibfk_1` FOREIGN KEY (`idasistencia`) REFERENCES `asistencia` (`IdAsistencia`) ON DELETE CASCADE;

--
-- Filtros para la tabla `turno_planificado`
--
ALTER TABLE `turno_planificado`
  ADD CONSTRAINT `fk_turno_asistencia` FOREIGN KEY (`IdAsistencia`) REFERENCES `asistencia` (`IdAsistencia`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_turno_empresa` FOREIGN KEY (`IdEmpresa`) REFERENCES `empresa` (`IdEmpresa`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_turno_usuario` FOREIGN KEY (`IdUsuario`) REFERENCES `usuario` (`IdUsuario`) ON DELETE CASCADE;

--
-- Filtros para la tabla `usuario`
--
ALTER TABLE `usuario`
  ADD CONSTRAINT `fk_usuario_empresa` FOREIGN KEY (`IdEmpresa`) REFERENCES `empresa` (`IdEmpresa`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
